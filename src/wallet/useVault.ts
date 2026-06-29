'use client'

import { useEffect, useState } from 'react'
import { HB_DATA } from '../data'
import { fetchSharePrice, fetchTotalAssets } from './vault'
import { useWallet } from './WalletProvider'

export interface VaultState {
  sharePrice: number
  totalAssets: number
  loading: boolean
  error: string | null
}

/**
 * Returns live vault state from the Soroban contract, or mock values when
 * NEXT_PUBLIC_VAULT_CONTRACT_ID is not set or the read fails.
 * Demo sessions skip the RPC entirely.
 */
export function useVault(): VaultState {
  const { address, isDemo } = useWallet()
  const [sharePrice, setSharePrice] = useState(HB_DATA.pool.sharePrice)
  const [totalAssets, setTotalAssets] = useState(HB_DATA.pool.totalAssets)
  const [loading, setLoading] = useState(!!process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID && !isDemo)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const contractId = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
    if (!contractId || isDemo || !address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    Promise.all([fetchSharePrice(address), fetchTotalAssets(address)])
      .then(([price, assets]) => {
        setSharePrice(price)
        setTotalAssets(assets)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not read vault')
      })
      .finally(() => setLoading(false))
  }, [address, isDemo])

  return { sharePrice, totalAssets, loading, error }
}
