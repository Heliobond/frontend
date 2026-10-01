import { describe, it, expect } from 'vitest'
import {
  searchByName,
  searchBondsByName,
  getPersistedSortOrder,
  persistSortOrder,
  getPersistedYieldRange,
  persistYieldRange,
} from '@/lib/bondUtils'

const projects = [
  { id: '1', name: 'SOLAR Fund', location: 'Nevada, US' },
  { id: '2', name: 'Wind Power', location: 'Texas, US' },
  { id: '3', name: 'Hydro Bond', location: 'Ontario, CA' },
]

describe('bondUtils', () => {
  it('search is case-insensitive and matches name or location', () => {
    expect(searchByName(projects, 'solar')).toEqual([projects[0]])
    expect(searchBondsByName(projects, 'SOLAR')).toEqual([projects[0]])
    expect(searchByName(projects, 'texas')).toEqual([projects[1]])
    expect(searchByName(projects, 'ONTARIO')).toEqual([projects[2]])
    expect(searchByName(projects, '')).toEqual(projects)
  })

  it('rejects invalid inverted yield range where min > max', () => {
    localStorage.clear()
    window.history.replaceState(null, '', 'http://localhost:3000/portfolio?yieldRange=8-2')
    expect(getPersistedYieldRange()).toEqual([0, 15])
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
})
