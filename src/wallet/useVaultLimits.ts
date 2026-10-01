'use client'

import { useEffect, useState } from 'react'
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

export function useVaultLimits() {
  const { address, isDemo, network: walletNetwork } = useWallet()
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase() ||
    walletNetwork?.toLowerCase() ||
    'public') as 'public' | 'testnet'

  const [limits, setLimits] = useState<VaultLimits>(defaultLimits)
  const enabled = !!process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID && !isDemo && !!address

  const { tick } = useVaultRefresh(enabled)

  /**
   * Identifies the fetch whose result `limits` holds. `loading` is derived from
   * whether that request has settled, instead of being toggled from the effect
   * body where it would cause a cascading render (#598).
   */
  const requestKey = enabled && address ? `${address}:${network}:${tick}` : null
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = requestKey !== null && settledKey !== requestKey

  useEffect(() => {
    if (!enabled || !address || document.hidden) return

    let cancelled = false
    const key = `${address}:${network}:${tick}`

    fetchVaultLimits(address, network)
      .then((data) => {
        if (!cancelled) setLimits(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSettledKey(key)
      })

    return () => {
      cancelled = true
    }
  }, [address, enabled, network, tick])

  return { ...limits, loading }
}
