'use client'

import { useEffect, useState } from 'react'
import { fetchUsdcBalance } from './vault'
import { useVaultRefresh } from './useVaultRefresh'
import { useWallet } from './WalletProvider'

const DEMO_FIXTURE_BALANCE = 240

export interface UsdcBalanceState {
  balance: number | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * useUsdcBalance — reads the connected wallet's live on-chain USDC balance
 * from the Stellar Asset Contract (SAC) (#698).
 *
 * In demo mode (isDemo === true), keeps the demo fixture balance (240 USDC).
 * While loading or when the balance is unknown/unavailable (disconnected, SAC unconfigured, read failure),
 * returns `balance: null` so callers do not invent a number.
 */
export function useUsdcBalance(): UsdcBalanceState {
  const { address, isDemo, network: walletNetwork } = useWallet()
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase() ||
    walletNetwork?.toLowerCase() ||
    'public') as 'public' | 'testnet'

  const sacId = process.env.NEXT_PUBLIC_USDC_SAC_ID
  const enabled = Boolean(sacId) && !isDemo && Boolean(address)

  const [balance, setBalance] = useState<number | null>(() => (isDemo ? DEMO_FIXTURE_BALANCE : null))
  const [error, setError] = useState<string | null>(null)

  const { tick, refresh } = useVaultRefresh(enabled)

  const requestKey = enabled && address ? `${address}:${network}:${tick}` : null
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = requestKey !== null && settledKey !== requestKey

  useEffect(() => {
    if (isDemo) {
      setBalance(DEMO_FIXTURE_BALANCE)
      setError(null)
      return
    }

    if (!enabled || !address) {
      setBalance(null)
      setError(null)
      return
    }

    if (typeof document !== 'undefined' && document.hidden) return

    let cancelled = false
    const key = `${address}:${network}:${tick}`

    fetchUsdcBalance(address, network)
      .then((bal) => {
        if (!cancelled) {
          setBalance(bal)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setBalance(null)
          setError(e instanceof Error ? e.message : 'Could not read USDC balance')
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
  }, [address, enabled, isDemo, network, tick])

  return {
    balance: isDemo ? DEMO_FIXTURE_BALANCE : balance,
    loading: isDemo ? false : loading,
    error: isDemo ? null : error,
    refresh,
  }
}
