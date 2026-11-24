'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { fetchVaultLimits, type VaultLimits } from './vault'
import { useVaultRefresh } from './useVaultRefresh'
import { useWallet } from './WalletProvider'

import { MIN_DEPOSIT_USDC, MIN_WITHDRAW_SHARES } from '../config/vault'

const defaultLimits: VaultLimits = {
  paused: false,
  minDeposit: MIN_DEPOSIT_USDC,
  minWithdrawShares: MIN_WITHDRAW_SHARES,
  maxTx: 100000,
  lockExpiresAt: 0,
  utilizationBps: 0,
}

const subscribeNever = () => () => {}

/** E2E-only override of the withdraw lock; null outside the e2e wallet build. */
function readE2eLockExpiresAt(): number | null {
  if (process.env.NEXT_PUBLIC_E2E_TEST_WALLET !== 'true') return null
  try {
    const raw = window.localStorage.getItem('hb-e2e-withdraw-lock-expires-at')
    const expiresAt = raw === null ? NaN : Number(raw)
    return Number.isFinite(expiresAt) ? expiresAt : null
  } catch {
    return null
  }
}

export function useVaultLimits() {
  const { address, isDemo, network: walletNetwork } = useWallet()
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase() ||
    walletNetwork?.toLowerCase() ||
    'public') as 'public' | 'testnet'

  const enabled = !!process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID && !isDemo && !!address

  const { tick } = useVaultRefresh(enabled)

  const e2eLockExpiresAt = useSyncExternalStore(subscribeNever, readE2eLockExpiresAt, () => null)

  const walletKey = enabled ? `${address}:${network}` : null
  const [settled, setSettled] = useState<{
    walletKey: string
    tick: number
    limits: VaultLimits | null
  } | null>(null)
  const current = settled?.walletKey === walletKey ? settled : null
  const loading = walletKey !== null && current?.tick !== tick
  const limits = current?.limits ?? defaultLimits

  useEffect(() => {
    if (!walletKey || !address || document.hidden) return

    let cancelled = false
    fetchVaultLimits(address, network).then(
      (limits) => {
        if (!cancelled) setSettled({ walletKey, tick, limits })
      },
      () => {
        if (!cancelled) setSettled({ walletKey, tick, limits: null })
      },
    )

    return () => {
      cancelled = true
    }
  }, [address, network, tick, walletKey])

  return {
    ...limits,
    lockExpiresAt: (isDemo ? e2eLockExpiresAt : null) ?? limits.lockExpiresAt,
    loading,
    error: !loading && current?.limits === null ? 'vaultLimitsFailed' : null,
  }
}
