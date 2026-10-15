import { describe, it, expect } from 'vitest'
import {
  searchBondsByName,
  sortBondsByYield,
  filterBondsByYield,
  getPersistedSortOrder,
  persistSortOrder,
  getPersistedYieldRange,
  persistYieldRange,
  isValidYieldRange,
} from '@/lib/bondUtils'

const bonds = [
  { id: '1', name: 'SOLAR Fund', yield: 5, term: 12, rating: 'A' },
  { id: '2', name: 'Wind Power', yield: 5, term: 24, rating: 'B', location: 'Atacama, Chile' },
  { id: '3', name: 'Hydro Bond', yield: 7, term: 12, rating: 'A+' },
]

describe('bondUtils', () => {
  it('search is case-insensitive and matches name or location', () => {
    expect(searchBondsByName(bonds, 'solar')).toEqual([bonds[0]])
    expect(searchBondsByName(bonds, 'SOLAR')).toEqual([bonds[0]])
    expect(searchBondsByName(bonds, 'SoLaR')).toEqual([bonds[0]])
    expect(searchBondsByName(bonds, 'atacama')).toEqual([bonds[1]])
    expect(searchBondsByName(bonds, 'CHILE')).toEqual([bonds[1]])
    expect(searchBondsByName(bonds, '')).toEqual(bonds)
  })

  it('stable sort handles ties by name then id', () => {
    const sorted = sortBondsByYield(bonds, 'asc')
    expect(sorted[0].name).toBe('SOLAR Fund')
    expect(sorted[1].name).toBe('Wind Power')
    expect(sorted[2].name).toBe('Hydro Bond')
  })

  it('stable sort handles ties by name then id (descending)', () => {
    const sorted = sortBondsByYield(bonds, 'desc')
    expect(sorted[0].name).toBe('Hydro Bond')
    expect(sorted[1].name).toBe('SOLAR Fund')
    expect(sorted[2].name).toBe('Wind Power')
  })

  it('filter by yield persists range', () => {
    expect(filterBondsByYield(bonds, [5, 5]).length).toBe(2)
    expect(filterBondsByYield(bonds, [6, 8]).length).toBe(1)
  })

  it('persists sort order to URL and localStorage for bookmarking/sharing', () => {
    localStorage.clear()
    window.history.replaceState(null, '', 'http://localhost:3000/portfolio')

    // Default sort order is 'asc'
    expect(getPersistedSortOrder()).toBe('asc')

    // User sorts portfolio by yield (e.g. descending)
    persistSortOrder('desc')
    expect(window.location.search).toContain('sortOrder=desc')
    expect(localStorage.getItem('bond_sort_order')).toBe('desc')
    expect(getPersistedSortOrder()).toBe('desc')

    // Friend opens the bookmarked/shared URL without localStorage set
    localStorage.clear()
    expect(getPersistedSortOrder()).toBe('desc')

    // Also supports reading sortOrder='asc'
    persistSortOrder('asc')
    expect(window.location.search).toContain('sortOrder=asc')
    expect(getPersistedSortOrder()).toBe('asc')
  })

  it('persists and restores yield range from URL', () => {
    localStorage.clear()
    window.history.replaceState(null, '', 'http://localhost:3000/portfolio')

    expect(getPersistedYieldRange()).toEqual([0, 15])

    persistYieldRange([3, 12])
    expect(window.location.search).toContain('yieldRange=3-12')
    expect(localStorage.getItem('bond_yield_filter')).toBe(JSON.stringify([3, 12]))

    // Friend opens URL with clean localStorage
    localStorage.clear()
    expect(getPersistedYieldRange()).toEqual([3, 12])
  })

  it('restores yield range from alternative query parameter formats', () => {
    localStorage.clear()

    window.history.replaceState(null, '', 'http://localhost:3000/portfolio?yield=4-9')
    expect(getPersistedYieldRange()).toEqual([4, 9])

    window.history.replaceState(null, '', 'http://localhost:3000/portfolio?range=2-7')
    expect(getPersistedYieldRange()).toEqual([2, 7])

    window.history.replaceState(null, '', 'http://localhost:3000/portfolio?minYield=5&maxYield=11')
    expect(getPersistedYieldRange()).toEqual([5, 11])
  })

  it('retains yield filter in localStorage when navigating to clean URL', () => {
    localStorage.clear()
    window.history.replaceState(null, '', 'http://localhost:3000/portfolio')

    persistYieldRange([4, 10])
    // User navigates away to clean URL (e.g. /project/1)
    window.history.replaceState(null, '', 'http://localhost:3000/project/1')
    expect(getPersistedYieldRange()).toEqual([4, 10])
  })

  it('restores ?yieldRange=2-8 URL param and falls back to stored range when URL param is missing', () => {
    localStorage.clear()

    // 1. Restores ?yieldRange=2-8 from URL
    window.history.replaceState(null, '', 'http://localhost:3000/explore?yieldRange=2-8')
    expect(getPersistedYieldRange()).toEqual([2, 8])

    // 2. Restores stored range from localStorage when URL param is missing
    localStorage.setItem('bond_yield_filter', JSON.stringify([3, 7]))
    window.history.replaceState(null, '', 'http://localhost:3000/explore')
    expect(getPersistedYieldRange()).toEqual([3, 7])

    // 3. Ignores inverted range like 8-2 and falls back to localStorage
    window.history.replaceState(null, '', 'http://localhost:3000/explore?yieldRange=8-2')
    expect(getPersistedYieldRange()).toEqual([3, 7])

    // 4. Ignores inverted stored range and falls back to default [0, 15]
    localStorage.setItem('bond_yield_filter', JSON.stringify([10, 4]))
    window.history.replaceState(null, '', 'http://localhost:3000/explore')
    expect(getPersistedYieldRange()).toEqual([0, 15])
  })

  it('validates yield ranges correctly with isValidYieldRange', () => {
    expect(isValidYieldRange(2, 8)).toBe(true)
    expect(isValidYieldRange(0, 15)).toBe(true)
    expect(isValidYieldRange(5, 5)).toBe(true)
    expect(isValidYieldRange(8, 2)).toBe(false)
    expect(isValidYieldRange(-1, 5)).toBe(false)
    expect(isValidYieldRange(NaN, 5)).toBe(false)
    expect(isValidYieldRange(5, Infinity)).toBe(false)
  })
})
