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
      if (Number.isFinite(min) && Number.isFinite(max)) return [min, max]
    }
    const minParam = url.searchParams.get('minYield')
    const maxParam = url.searchParams.get('maxYield')
    if (minParam !== null && maxParam !== null) {
      const min = Number(minParam)
      const max = Number(maxParam)
      if (Number.isFinite(min) && Number.isFinite(max)) return [min, max]
    }
    const stored = localStorage.getItem(YIELD_FILTER_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length === 2) {
        const [min, max] = parsed
        if (Number.isFinite(min) && Number.isFinite(max)) return [min, max]
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

export function filterBondsByYield(bonds: Bond[], range: [number, number]): Bond[] {
  const [min, max] = range
  return bonds.filter((b) => b.yield >= min && b.yield <= max)
}

// #363 -- case-insensitive search
export function searchBondsByName(bonds: Bond[], query: string): Bond[] {
  const q = query.trim().toLowerCase()
  if (!q) return bonds
  return bonds.filter((b) => b.name.toLowerCase().includes(q))
}

// #359 -- stable sort with tie-breaker (name, then id)
export function sortBondsByYield(bonds: Bond[], direction: 'asc' | 'desc' = 'asc'): Bond[] {
  const dir = direction === 'asc' ? 1 : -1
  return [...bonds].sort((a, b) => {
    if (a.yield !== b.yield) return (a.yield - b.yield) * dir
    const nameCmp = a.name.localeCompare(b.name)
    if (nameCmp !== 0) return nameCmp
    return String(a.id).localeCompare(String(b.id))
  })
}

// #361 -- bond comparison (side-by-side) comparison helper
export function getBondsForComparison(bonds: Bond[], ids: (string | number)[]): Bond[] {
  if (ids.length < 2 || ids.length > 3) throw new Error('Select 2-3 bonds to compare')
  const map = new Map(bonds.map((b) => [String(b.id), b]))
  const selected = ids.map((id) => map.get(String(id))).filter(Boolean) as Bond[]
  if (selected.length !== ids.length) throw new Error('One or more bonds not found')
  return selected
}

// #367 -- projected return on an investment amount at a given annual yield (%),
// simple (non-compounding) interest over the given number of years.
export function projectedReturn(amount: number, annualYieldPct: number, years = 1): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return amount * (annualYieldPct / 100) * years
}

export function compareBondsMetrics(bonds: Bond[]): Record<string, (string | number)[]> {
  const metrics = ['yield', 'term', 'rating', 'name'] as const
  const result: Record<string, (string | number)[]> = {}
  for (const m of metrics) {
    result[m] = bonds.map((b) => b[m])
  }
  return result
}

// #portfolio-risk -- risk indicator (conservative/moderate/aggressive) from a bond ratings mix.
export type RiskLevel = 'conservative' | 'moderate' | 'aggressive'

export interface PortfolioRisk {
  score: number
  level: RiskLevel
}

const RATING_RISK_SCORES: Record<string, number> = {
  AAA: 0,
  'AA+': 5,
  AA: 10,
  'AA-': 15,
  'A+': 20,
  A: 25,
  'A-': 30,
  'BBB+': 35,
  BBB: 40,
  'BBB-': 45,
  'BB+': 55,
  BB: 60,
  'BB-': 65,
  'B+': 70,
  B: 75,
  'B-': 80,
  'CCC+': 85,
  CCC: 90,
  'CCC-': 95,
  CC: 98,
  C: 99,
  D: 100,
}

export function getPortfolioRisk(bonds: Bond[]): PortfolioRisk {
  if (bonds.length === 0) return { score: 0, level: 'conservative' }
  const total = bonds.reduce((sum, bond) => {
    const rating = bond.rating.trim().toUpperCase()
    return sum + (RATING_RISK_SCORES[rating] ?? 50)
  }, 0)
  const score = Math.round(total / bonds.length)
  const level: RiskLevel = score < 35 ? 'conservative' : score < 70 ? 'moderate' : 'aggressive'
  return { score, level }
}

// #historical-pricing -- generate simulated historical price/yield data to display trends.
// In a real app replace this with an API call to fetch historical bond data.
export function getBondHistory(bond: Bond, days = 30): BondHistoryPoint[] {
  if (days <= 0) return []
  const seed =
    String(bond.id)
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0) || 1
  let s = seed
  const random = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }

  const baseYield = bond.yield
  const basePrice = 100
  const history: BondHistoryPoint[] = []
  const today = new Date()

  // Generate a random walk of yield deviations, anchored at the most recent day (baseYield).
  const deviations: number[] = new Array(days)
  deviations[days - 1] = 0
  for (let i = days - 2; i >= 0; i--) {
    const delta = (random() - 0.5) * 0.15
    deviations[i] = deviations[i + 1] + delta
  }

  for (let i = 0; i < days; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() - (days - 1 - i))
    const yieldValue = Math.max(0.1, baseYield + deviations[i])
    const price = basePrice * (100 / (100 + (yieldValue - baseYield) * 5))
    history.push({
      date: date.toISOString().slice(0, 10),
      price: Math.round(price * 100) / 100,
      yield: Math.round(yieldValue * 100) / 100,
    })
  }
  return history
}
