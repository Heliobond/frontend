/*
 * Bond utilities -- addresses multiple bond-related issues:
 *  - #364 filter persistence via URL + localStorage
 *  - #363 case-insensitive search
 *  - #359 stable sort with tie-breaker
 *  - #361 bond comparison view data helper
 *  - #367 projected return from an investment amount + annual yield
 *  - #portfolio-risk show portfolio risk score based on bond ratings mix
 *  - #historical-pricing display historical pricing for bonds to show trends
 */

export interface Bond {
  id: string | number
  name: string
  yield: number
  term: number
  rating: string
}

export interface BondHistoryPoint {
  date: string
  price: number
  yield: number
}

const YIELD_FILTER_KEY = 'bond_yield_filter'
const YIELD_DEFAULT: [number, number] = [0, 15]

export type SortDirection = 'asc' | 'desc'

const SORT_ORDER_KEY = 'bond_sort_order'
const SORT_DEFAULT: SortDirection = 'asc'

export function getPersistedYieldRange(): [number, number] {
  if (typeof window === 'undefined') return YIELD_DEFAULT
  try {
    // Reads the live href. The previous literal string `'window.location.href'`
    // was parsed as a relative URL and threw, so the query-string override was
    // silently swallowed by the catch below and never applied.
    const url = new URL(window.location.href)
    const fromUrl =
      url.searchParams.get('yieldRange') ||
      url.searchParams.get('yield') ||
      url.searchParams.get('range')
    if (fromUrl) {
      const [min, max] = fromUrl.split('-').map(Number)
      if (Number.isFinite(min) && Number.isFinite(max) && min <= max) return [min, max]
    }
    const minParam = url.searchParams.get('minYield')
    const maxParam = url.searchParams.get('maxYield')
    if (minParam !== null && maxParam !== null) {
      const min = Number(minParam)
      const max = Number(maxParam)
      if (Number.isFinite(min) && Number.isFinite(max) && min <= max) return [min, max]
    }
    const stored = localStorage.getItem(YIELD_FILTER_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length === 2) {
        const [min, max] = parsed
        if (Number.isFinite(min) && Number.isFinite(max) && min <= max) return [min, max]
      }
    }
  } catch {}
  return YIELD_DEFAULT
}

export function persistYieldRange(range: [number, number]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(YIELD_FILTER_KEY, JSON.stringify(range))
    const url = new URL(window.location.href)
    url.searchParams.set('yieldRange', `${range[0]}-${range[1]}`)
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {}
}

let yieldRangeSnapshot: [number, number] = YIELD_DEFAULT
const yieldRangeListeners = new Set<() => void>()

/**
 * Subscribes to the saved yield range, including changes made in another tab
 * and changes to the `?yieldRange` query parameter.
 *
 * Exposed as an external store so `useBondFilters` can read it through
 * `useSyncExternalStore` instead of copying storage into state from an effect
 * (#598). The snapshot is cached and only recomputed on write or on a relevant
 * external change, which keeps it referentially stable between renders.
 */
export function subscribeYieldRange(listener: () => void): () => void {
  if (!yieldRangeListeners.size) yieldRangeSnapshot = getPersistedYieldRange()
  yieldRangeListeners.add(listener)
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onYieldRangeStorage)
    window.addEventListener('popstate', republishYieldRange)
    window.addEventListener('pageshow', republishYieldRange)
    document.addEventListener('visibilitychange', onYieldRangeVisible)
  }
  return () => {
    yieldRangeListeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onYieldRangeStorage)
      window.removeEventListener('popstate', republishYieldRange)
      window.removeEventListener('pageshow', republishYieldRange)
      document.removeEventListener('visibilitychange', onYieldRangeVisible)
    }
  }
}

function republishYieldRange(): void {
  yieldRangeSnapshot = getPersistedYieldRange()
  yieldRangeListeners.forEach((listener) => listener())
}

function onYieldRangeStorage(event: StorageEvent): void {
  if (event.key && event.key !== YIELD_FILTER_KEY) return
  republishYieldRange()
}

/** Another tab may have written the range while this one was in the background. */
function onYieldRangeVisible(): void {
  if (document.visibilityState === 'visible') republishYieldRange()
}

export function getYieldRange(): [number, number] {
  return yieldRangeSnapshot
}

/** The default on the server, so the first client render matches the server HTML. */
export function getServerYieldRange(): [number, number] {
  return YIELD_DEFAULT
}

/** Saves a new range and notifies subscribers. */
export function setYieldRange(range: [number, number]): void {
  yieldRangeSnapshot = range
  persistYieldRange(range)
  yieldRangeListeners.forEach((listener) => listener())
}

export function getPersistedSortOrder(): SortDirection {
  if (typeof window === 'undefined') return SORT_DEFAULT
  try {
    const url = new URL(window.location.href)
    const fromUrl =
      url.searchParams.get('sortOrder') ||
      url.searchParams.get('sortDir') ||
      url.searchParams.get('sort') ||
      url.searchParams.get('direction')
    if (fromUrl === 'asc' || fromUrl === 'desc') return fromUrl
    const stored = localStorage.getItem(SORT_ORDER_KEY)
    if (stored === 'asc' || stored === 'desc') return stored
  } catch {}
  return SORT_DEFAULT
}

export function persistSortOrder(direction: SortDirection): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SORT_ORDER_KEY, direction)
    const url = new URL(window.location.href)
    url.searchParams.set('sortOrder', direction)
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {}
}

export const getPersistedSortDirection = getPersistedSortOrder
export const persistSortDirection = persistSortOrder

let sortOrderSnapshot: SortDirection = SORT_DEFAULT
const sortOrderListeners = new Set<() => void>()

/**
 * Subscribes to the saved bond sort order, including changes made in another tab
 * and changes to the `?sortOrder` query parameter. Same external-store shape as
 * the yield range so `useBondFilters` never copies storage into state (#598).
 */
export function subscribeSortOrder(listener: () => void): () => void {
  if (!sortOrderListeners.size) sortOrderSnapshot = getPersistedSortOrder()
  sortOrderListeners.add(listener)
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onSortOrderStorage)
    window.addEventListener('popstate', republishSortOrder)
    window.addEventListener('pageshow', republishSortOrder)
    document.addEventListener('visibilitychange', onSortOrderVisible)
  }
  return () => {
    sortOrderListeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onSortOrderStorage)
      window.removeEventListener('popstate', republishSortOrder)
      window.removeEventListener('pageshow', republishSortOrder)
      document.removeEventListener('visibilitychange', onSortOrderVisible)
    }
  }
}

function republishSortOrder(): void {
  sortOrderSnapshot = getPersistedSortOrder()
  sortOrderListeners.forEach((listener) => listener())
}

function onSortOrderStorage(event: StorageEvent): void {
  if (event.key && event.key !== SORT_ORDER_KEY) return
  republishSortOrder()
}

function onSortOrderVisible(): void {
  if (document.visibilityState === 'visible') republishSortOrder()
}

export function getSortOrder(): SortDirection {
  return sortOrderSnapshot
}

/** The default on the server, so the first client render matches the server HTML. */
export function getServerSortOrder(): SortDirection {
  return SORT_DEFAULT
}

/** Saves a new sort order and notifies subscribers. */
export function setSortOrder(direction: SortDirection): void {
  sortOrderSnapshot = direction
  persistSortOrder(direction)
  sortOrderListeners.forEach((listener) => listener())
}

// Case-insensitive search shared across Explore and bond screens (#707, #363)
export function searchByName<T extends { name: string; location?: string }>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      (item.location ? item.location.toLowerCase().includes(q) : false),
  )
}

export const searchBondsByName = searchByName

// #367 -- projected return on an investment amount at a given annual yield (%),
// simple (non-compounding) interest over the given number of years.
export function projectedReturn(amount: number, annualYieldPct: number, years = 1): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return amount * (annualYieldPct / 100) * years
}
