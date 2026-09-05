'use client'

import { useCallback, useEffect, useState } from 'react'
import { HB_DATA } from '../data'
import { fetchSharePrice, fetchTotalAssets } from './vault'
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
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase() ||
    walletNetwork?.toLowerCase() ||
    'public') as 'public' | 'testnet'

  const [sharePrice, setSharePrice] = useState(HB_DATA.pool.sharePrice)
  const [totalAssets, setTotalAssets] = useState(HB_DATA.pool.totalAssets)
  const [loading, setLoading] = useState(!!process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID && !isDemo)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(new Date())
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    const contractId = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
    if (!contractId || isDemo || !address) {
      setLoading(false)
      if (!fetchedAt) setFetchedAt(new Date())
      return
    }

    setLoading(true)
    setError(null)

    Promise.all([fetchSharePrice(network), fetchTotalAssets(network)])
      .then(([price, assets]) => {
        setSharePrice(Number(price))
        setTotalAssets(assets)
        setFetchedAt(new Date())
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not read vault')
        setFetchedAt(new Date())
      })
      .finally(() => setLoading(false))
  }, [address, isDemo, tick, network])

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID || isDemo) return
    const id = setInterval(() => refresh(), 30000)
    return () => clearInterval(id)
  }, [isDemo, refresh])

  return { sharePrice, totalAssets, loading, error, fetchedAt, refresh }
}
