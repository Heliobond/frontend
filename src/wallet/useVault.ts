'use client'

import { useEffect, useState } from 'react'
import { selectSharePrice, selectTotalAssets } from '../state/selectors'
import { fetchSharePrice, fetchTotalAssets } from './vault'
import { useVaultRefresh } from './useVaultRefresh'
import { useWallet } from './WalletProvider'

export interface VaultState {
  fetchedAt: Date | null
  sharePrice: number
  totalAssets: number
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useVault(): VaultState {
  const { address, isDemo, network: walletNetwork } = useWallet()
  // Allow explicit override via env var, otherwise use wallet's network, fallback to public
  // WalletProvider uses 'TESTNET'/'PUBLIC', normalize to lowercase 'testnet'/'public' for vault.ts
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase() ||
    walletNetwork?.toLowerCase() ||
    'public') as 'public' | 'testnet'

  const [sharePrice, setSharePrice] = useState(selectSharePrice())
  const [totalAssets, setTotalAssets] = useState(selectTotalAssets())
  const [completedRequest, setCompletedRequest] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(new Date())
  const enabled = !!process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID && !isDemo && !!address
  const { tick, refresh } = useVaultRefresh(enabled)
  const requestKey = `${address}:${network}:${tick}:${enabled}`
  const loading =
    enabled &&
    completedRequest !== requestKey &&
    (typeof document === 'undefined' || !document.hidden)

  useEffect(() => {
    if (!enabled || !address || document.hidden) return

    let cancelled = false

    // Pass connected address as sourceAddress, network as second argument
    Promise.all([fetchSharePrice(address, network), fetchTotalAssets(address, network)])
      .then(([price, assets]) => {
        if (cancelled) return
        // fetchSharePrice resolves a decimal string — coerce for numeric state.
        setError(null)
        setSharePrice(Number(price))
        setTotalAssets(assets)
        setFetchedAt(new Date())
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not read vault')
        // Do NOT advance `fetchedAt` on a failed read: the displayed values are
        // whatever the last successful read produced, so keep their timestamp
        // (issue #624).
      })
      .finally(() => {
        if (!cancelled) setCompletedRequest(requestKey)
      })
    return () => {
      cancelled = true
    }
  }, [address, enabled, requestKey, network])

  return { sharePrice, totalAssets, loading, error: loading ? null : error, fetchedAt, refresh }
}
