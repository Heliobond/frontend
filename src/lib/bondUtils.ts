/*
 * Bond utilities -- addresses multiple bond-related issues:
  *  - #364 filter persistence via URL + localStorage
  *  - #363 case-insensitive search
  *  - #359 stable sort with tie-breaker
  *  - #361 bond comparison view data helper
  *  - #367 projected return from an investment amount + annual yield
  *  - #portfolio-risk show portfolio risk score based on bond ratings mix
 */

export interface Bond {
  id: string | number
  name: string
  yield: number
  term: number
  rating: string
}

const YIELD_FILTER_KEY = 'bond_yield_filter'
const YIELD_DEFAULT: [number, number] = [0, 15]

export function getPersistedYieldRange(): [number, number] {
  if (typeof window === 'undefined') return YIELD_DEFAULT
  try {
    const url = new URL(window.location.href)
    const fromUrl = url.searchParams.get('yieldRange')
    if (fromUrl) {
      const [min, max] = fromUrl.split('-').map(Number)
      if (Number.isFinite(min) && Number.isFinite(max)) return [min, max]
    }
    const stored = localStorage.getItem(YIELD_FILTER_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length === 2) return parsed as [number, number]
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
    window.history.replaceState(null, '', url.toString())
  } catch {}
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

// #361 -- bond comparison (side-by-side) helper
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
    result[m] = bonds.map((b) => (b as any)[m])
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
  'AAA': 0,
  'AA+': 5,
  'AA': 10,
  'AA-': 15,
  'A+': 20,
  'A': 25,
  'A-': 30,
  'BBB+': 35,
  'BBB': 40,
  'BBB-': 45,
  'BB+': 55,
  'BB': 60,
  'BB-': 65,
  'B+': 70,
  'B': 75,
  'B-': 80,
  'CCC+': 85,
  'CCC': 90,
  'CCC-': 95,
  'CC': 98,
  'C': 99,
  'D': 100,
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
