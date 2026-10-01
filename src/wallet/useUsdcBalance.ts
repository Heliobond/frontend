'use client'

import { useEffect, useState } from 'react'
import { fetchUsdcBalance } from './vault'
import { useVaultRefresh } from './useVaultRefresh'
import { useWallet } from './WalletProvider'
import { USDC_SAC_ID } from '../config/network'

export interface UsdcBalanceState {
  balance: number | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/** Demo wallet fixture USDC balance (#698). */
export const DEMO_USDC_BALANCE = 240

/**
 * Reads the connected wallet's live on-chain USDC balance from the USDC SAC contract.
 * - In demo mode (isDemo === true), preserves the fixture balance of 240 USDC.
 * - With a real wallet, fetches on-chain balance and polls via useVaultRefresh.
 * - While loading, unconfigured, or on read error, balance is null ("Balance unavailable").
 */
export function useUsdcBalance(): UsdcBalanceState {
  const { address, isDemo, network: walletNetwork } = useWallet()
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase() ||
    walletNetwork?.toLowerCase() ||
    'public') as 'public' | 'testnet'

  const sacId = process.env.NEXT_PUBLIC_USDC_SAC_ID || USDC_SAC_ID
  const enabled = !isDemo && Boolean(address) && Boolean(sacId)

  const { tick, refresh } = useVaultRefresh(enabled)
  const [liveBalance, setLiveBalance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requestKey = enabled && address ? `${address}:${network}:${tick}:${sacId}` : null
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = enabled && requestKey !== null && settledKey !== requestKey

  useEffect(() => {
    if (!enabled || !address || document.hidden) return

    let cancelled = false
    const key = `${address}:${network}:${tick}:${sacId}`

    fetchUsdcBalance(address, network)
      .then((val) => {
        if (!cancelled) {
          setLiveBalance(val)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLiveBalance(null)
          setError(err instanceof Error ? err.message : 'Failed to fetch USDC balance')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettledKey(key)
        }
      })

    return () => {
      cancelled = true
    }
  }, [address, enabled, network, sacId, tick])

  return {
    balance: isDemo ? DEMO_USDC_BALANCE : liveBalance,
    loading,
    error: isDemo ? null : error,
    refresh,
  }
}
