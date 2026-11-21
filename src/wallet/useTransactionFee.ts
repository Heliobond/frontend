'use client'
import { useEffect, useState } from 'react'
import { estimateTransactionFee } from './vault'

export type FeeEstimateStatus = 'idle' | 'pending' | 'success' | 'unavailable'

export interface TransactionFeeResult {
  fee: number | null
  status: FeeEstimateStatus
  isPending: boolean
  isUnavailable: boolean
}

export function useTransactionFee(
  kind: 'deposit' | 'withdraw',
  amount: number,
  address: string | null | undefined,
  slippage: number,
): TransactionFeeResult {
  const key = `${kind}:${amount}:${address}:${slippage}`
  const [prevKey, setPrevKey] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<{
    key: string
    fee: number | null
    status: 'success' | 'unavailable'
  } | null>(null)

  if (prevKey !== key) {
    setPrevKey(key)
    setEstimate(null)
  }

  const isValid = Boolean(address && Number.isFinite(amount) && amount > 0)

  useEffect(() => {
    if (!isValid || !address) return
    let active = true
    const timer = setTimeout(() => {
      void estimateTransactionFee(kind, amount, address, slippage).then(
        (fee) => {
          if (!active) return
          if (typeof fee === 'number' && Number.isFinite(fee)) {
            setEstimate({ key, fee, status: 'success' })
          } else {
            setEstimate({ key, fee: null, status: 'unavailable' })
          }
        },
        () => {
          if (active) {
            setEstimate({ key, fee: null, status: 'unavailable' })
          }
        },
      )
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [kind, amount, address, slippage, key, isValid])

  if (!isValid) {
    return { fee: null, status: 'idle', isPending: false, isUnavailable: false }
  }

  if (estimate?.key === key) {
    return {
      fee: estimate.fee,
      status: estimate.status,
      isPending: false,
      isUnavailable: estimate.status === 'unavailable',
    }
  }

  return { fee: null, status: 'pending', isPending: true, isUnavailable: false }
}
