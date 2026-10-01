'use client'
import { useSyncExternalStore } from 'react'
import {
  getServerSortOrder,
  getServerYieldRange,
  getSortOrder,
  getYieldRange,
  setSortOrder as persistSort,
  setYieldRange as persistRange,
  subscribeSortOrder,
  subscribeYieldRange,
} from '@/lib/bondUtils'

/**
 * The selected bond yield range. Read through an external store so the first
 * client render already reflects the persisted value instead of being corrected
 * by an effect afterwards (#598). Changes in another tab are picked up too.
 */
export function useBondFilters() {
  const yieldRange = useSyncExternalStore(subscribeYieldRange, getYieldRange, getServerYieldRange)
  const sortOrder = useSyncExternalStore(subscribeSortOrder, getSortOrder, getServerSortOrder)
  return {
    yieldRange,
    setYieldRange: persistRange,
    sortOrder,
    setSortOrder: persistSort,
    sortDirection: sortOrder,
    setSortDirection: persistSort,
  }
}

export default useBondFilters
