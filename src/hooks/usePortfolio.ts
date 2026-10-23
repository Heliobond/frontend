import { useEffect, useState, useCallback } from 'react'
import { useWallet } from '../wallet/WalletProvider'
import { useVaultRefresh } from '../wallet/useVaultRefresh'
import {
  fetchPortfolio,
  fetchClaimableYield,
  fetchTotalAssets,
  fetchUtilizationBps,
  fetchVaultLiquidUsdc,
  type OnChainPortfolio,
} from '../wallet/vault'
import { selectYou, selectActivity, selectPoolSummary, type YouSummary } from '../state/selectors'
import { type Activity } from '../data'
import { apiFetch } from '../lib/api'

export interface VaultLiquidity {
  liquid: number
  total: number
}

export interface UsePortfolioResult {
  portfolio: OnChainPortfolio | null
  claimableYield: number
  you: YouSummary
  activity: Activity[]
  loading: boolean
  error: string | null
  refresh: () => void
  vaultLiquidity: VaultLiquidity | null
}

interface ChainState {
  address: string
  portfolio: OnChainPortfolio | null
  claimableYield: number
  vaultLiquidity: VaultLiquidity | null
  error: string | null
}

/**
 * usePortfolio — drives investor portfolio metrics from the connected wallet's
 * live Soroban contract state (get_portfolio + claimable_yield) and indexed backend activity.
 *
 * In demo mode or when no vault contract ID is configured, falls back seamlessly to demo fixtures.
 */
export function usePortfolio(customAddress?: string): UsePortfolioResult {
  const { address: walletAddress, isDemo, connected } = useWallet()
  const address = customAddress ?? walletAddress

  const enabled =
    Boolean(process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID) && !isDemo && Boolean(connected && address)

  /**
   * Fetched state is stamped with the address it belongs to, so switching
   * address can never surface the previous wallet's figures: anything stamped
   * for a different address is ignored when deriving the result (#821).
   */
  const [chain, setChain] = useState<ChainState | null>(null)
  const [activityState, setActivityState] = useState<{ address: string; feed: Activity[] } | null>(
    null,
  )
  // Bumped when a tab that was hidden at mount becomes visible.
  const [visibleTick, setVisibleTick] = useState(0)

  const { tick: reloads, refresh: triggerVaultRefresh } = useVaultRefresh(enabled)

  /**
   * Identifies the fetch currently on screen. `settledKey` is the last request
   * that finished, so `loading` is derived rather than toggled from the effect
   * body, which would cause a cascading render (#598). Changing address or
   * asking for a refresh changes the key and re-arms the spinner.
   */
  const requestKey = enabled && address ? `${address}:${reloads}:${visibleTick}` : null
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = requestKey !== null && settledKey !== requestKey

  const loadActivity = useCallback(async (addr: string, isCancelled: () => boolean) => {
    if (!process.env.NEXT_PUBLIC_API_URL) return
    try {
      const remoteActivity = await apiFetch<Activity[]>(`/portfolio/${addr}/activity`)
      if (!isCancelled() && Array.isArray(remoteActivity)) {
        setActivityState({ address: addr, feed: remoteActivity })
      }
    } catch {
      // Silent fallback to standard demo activity when backend indexer endpoint is unavailable
    }
  }, [])

  const loadData = useCallback(
    async (isCancelled: () => boolean) => {
      if (!enabled || !address) {
        return
      }

      const key = `${address}:${reloads}:${visibleTick}`
      try {
        // Fetch Soroban portfolio, yield, and pool liquidity in parallel for time complexity O(1)
        const [portResult, yieldResult, totalAssetsResult, utilBpsResult, liquidResult] =
          await Promise.allSettled([
            fetchPortfolio(address),
            fetchClaimableYield(address),
            fetchTotalAssets(address),
            fetchUtilizationBps(address),
            fetchVaultLiquidUsdc(address),
          ])

        if (isCancelled()) return

        const portfolioValue = portResult.status === 'fulfilled' ? portResult.value : null
        let claimable = 0
        let error: string | null = null

        if (portResult.status === 'rejected') {
          error = 'portfolioFailed'
        }

        if (yieldResult.status === 'fulfilled') {
          claimable = yieldResult.value
        } else if (portfolioValue) {
          claimable = portfolioValue.claimableYield
          error = 'portfolioFailed'
        }

        let liquidity: VaultLiquidity | null = null
        if (totalAssetsResult.status === 'fulfilled' && totalAssetsResult.value > 0) {
          const total = totalAssetsResult.value
          const bps = utilBpsResult.status === 'fulfilled' ? utilBpsResult.value : 0
          const liquid =
            liquidResult.status === 'fulfilled' ? liquidResult.value : total * (1 - bps / 10000)
          liquidity = { liquid, total }
        }

        setChain((prev) => ({
          address,
          // A failed refetch keeps the last good position, but only for this address.
          portfolio: portfolioValue ?? (prev?.address === address ? prev.portfolio : null),
          claimableYield: claimable,
          vaultLiquidity: liquidity,
          error,
        }))
      } catch (e) {
        if (!isCancelled()) {
          setChain((prev) => ({
            address,
            portfolio: prev?.address === address ? prev.portfolio : null,
            claimableYield: prev?.address === address ? prev.claimableYield : 0,
            vaultLiquidity: prev?.address === address ? prev.vaultLiquidity : null,
            // Error code, not user-facing copy — the component translates (#900).
            error: 'portfolioFailed',
          }))
        }
      } finally {
        if (!isCancelled()) {
          // Loading ends with the on-chain results; activity is fetched separately below.
          setSettledKey(key)
        }
      }

      if (!isCancelled()) void loadActivity(address, isCancelled)
    },
    [enabled, address, reloads, visibleTick, loadActivity],
  )

  useEffect(() => {
    if (document.hidden) {
      // Nothing is fetched while hidden; retry once the tab becomes visible (#821).
      const onVisible = () => {
        if (!document.hidden) setVisibleTick((n) => n + 1)
      }
      document.addEventListener('visibilitychange', onVisible)
      return () => document.removeEventListener('visibilitychange', onVisible)
    }
    let cancelled = false
    // Kick the fetch off from a microtask so the effect body itself only
    // subscribes; every state update happens in the async continuation (#598).
    void Promise.resolve().then(() => loadData(() => cancelled))
    return () => {
      cancelled = true
    }
  }, [loadData, reloads])

  const current = chain && chain.address === address ? chain : null
  const portfolio = current?.portfolio ?? null
  const claimableYield = current?.claimableYield ?? 0
  const vaultLiquidity = current?.vaultLiquidity ?? null
  const error = current?.error ?? null
  const activityFeed = activityState && activityState.address === address ? activityState.feed : []

  // Derive YouSummary structure for UI compatibility
  const demoYou = selectYou()
  const demoActivity = selectActivity()
  const demoPool = selectPoolSummary()
  const demoVaultLiquidity: VaultLiquidity = {
    liquid: demoPool.liquid,
    total: demoPool.totalAssets,
  }

  const isReferralEnabled = process.env.NEXT_PUBLIC_ENABLE_REFERRALS === 'true'
  const liveReferralLink =
    isReferralEnabled && address
      ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://heliobond.fi'}/ref/${address}`
      : undefined

  const derivedYou: YouSummary = portfolio
    ? {
        value: portfolio.usdcValue,
        deltaAbs:
          portfolio.usdcValue >= portfolio.totalDeposited
            ? portfolio.usdcValue - portfolio.totalDeposited
            : 0,
        deltaPct:
          portfolio.totalDeposited > 0
            ? Number(
                (
                  ((portfolio.usdcValue - portfolio.totalDeposited) / portfolio.totalDeposited) *
                  100
                ).toFixed(1),
              )
            : 0,
        hbs: portfolio.shares,
        poolSharePct: Number((portfolio.shareOfPoolBps / 100).toFixed(2)),
        weightedGreen: demoYou.weightedGreen,
        backed: portfolio.shares > 0 ? demoYou.backed : 0,
        // Do NOT copy demoYou.riskScore or demoYou.riskLevel for on-chain positions (#702)
        referralLink: liveReferralLink,
      }
    : demoYou

  const finalActivity = enabled && activityFeed.length > 0 ? activityFeed : demoActivity

  return {
    portfolio: enabled ? portfolio : null,
    claimableYield: enabled ? claimableYield || (portfolio?.claimableYield ?? 0) : 0,
    you: enabled && portfolio ? derivedYou : demoYou,
    activity: finalActivity,
    loading: enabled ? loading : false,
    error: enabled ? error : null,
    refresh: triggerVaultRefresh,
    vaultLiquidity: enabled ? vaultLiquidity : demoVaultLiquidity,
  }
}
