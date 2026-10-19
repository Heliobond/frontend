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

  const [portfolio, setPortfolio] = useState<OnChainPortfolio | null>(null)
  const [claimableYield, setClaimableYield] = useState<number>(0)
  const [vaultLiquidity, setVaultLiquidity] = useState<VaultLiquidity | null>(null)
  const [activityFeed, setActivityFeed] = useState<Activity[]>([])
  const [error, setError] = useState<string | null>(null)

  const { tick: reloads, refresh: triggerVaultRefresh } = useVaultRefresh(enabled)

  /**
   * Identifies the fetch currently on screen. `settledKey` is the last request
   * that finished, so `loading` is derived rather than toggled from the effect
   * body, which would cause a cascading render (#598). Changing address or
   * asking for a refresh changes the key and re-arms the spinner.
   */
  const requestKey = enabled && address ? `${address}:${reloads}` : null
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = requestKey !== null && settledKey !== requestKey

  const loadData = useCallback(
    async (isCancelled: () => boolean) => {
      if (!enabled || !address) {
        return
      }

      const key = `${address}:${reloads}`
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

        if (portResult.status === 'fulfilled') {
          setPortfolio(portResult.value)
          setError(null)
        } else {
          const msg =
            portResult.reason instanceof Error
              ? portResult.reason.message
              : 'Could not load your on-chain portfolio position'
          setError(msg)
        }

        if (yieldResult.status === 'fulfilled') {
          setClaimableYield(yieldResult.value)
        } else if (portResult.status === 'fulfilled') {
          setClaimableYield(portResult.value.claimableYield)
          setError(
            yieldResult.reason instanceof Error
              ? yieldResult.reason.message
              : 'Could not load claimable yield',
          )
        }

        if (totalAssetsResult.status === 'fulfilled' && totalAssetsResult.value > 0) {
          const total = totalAssetsResult.value
          const bps = utilBpsResult.status === 'fulfilled' ? utilBpsResult.value : 0
          const liquid =
            liquidResult.status === 'fulfilled' ? liquidResult.value : total * (1 - bps / 10000)
          setVaultLiquidity({ liquid, total })
        } else {
          setVaultLiquidity(null)
        }

        if (portResult.status === 'fulfilled' && yieldResult.status === 'fulfilled') {
          setError(null)
        }

        // Optional backend activity fetch
        if (process.env.NEXT_PUBLIC_API_URL) {
          try {
            const remoteActivity = await apiFetch<Activity[]>(`/portfolio/${address}/activity`)
            if (!isCancelled() && Array.isArray(remoteActivity)) {
              setActivityFeed(remoteActivity)
            }
          } catch {
            // Silent fallback to standard demo activity when backend indexer endpoint is unavailable
          }
        }
      } catch (e) {
        if (!isCancelled()) {
          setError(e instanceof Error ? e.message : 'Failed to fetch vault portfolio data')
        }
      } finally {
        if (!isCancelled()) {
          setSettledKey(key)
        }
      }
    },
    [enabled, address, reloads],
  )

  useEffect(() => {
    if (document.hidden) return
    let cancelled = false
    // Kick the fetch off from a microtask so the effect body itself only
    // subscribes; every state update happens in the async continuation (#598).
    void Promise.resolve().then(() => loadData(() => cancelled))
    return () => {
      cancelled = true
    }
  }, [loadData, reloads])

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
