'use client'
import { useSyncExternalStore } from 'react'
import {
  getServerYieldRange,
  getYieldRange,
  setYieldRange as persistRange,
  subscribeYieldRange,
} from '@/lib/bondUtils'

/**
 * The selected bond yield range. Read through an external store so the first
 * client render already reflects the persisted value instead of being corrected
 * by an effect afterwards (#598). Changes in another tab are picked up too.
 */
export function useBondFilters() {
  const yieldRange = useSyncExternalStore(subscribeYieldRange, getYieldRange, getServerYieldRange)
  return { yieldRange, setYieldRange: persistRange }
}

export default useBondFilters
