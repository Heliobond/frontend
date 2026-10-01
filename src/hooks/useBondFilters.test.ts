import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBondFilters } from './useBondFilters'

describe('useBondFilters', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', 'http://localhost:3000/portfolio')
  })

  it('initializes with default values when URL and storage are empty', () => {
    const { result } = renderHook(() => useBondFilters())
    expect(result.current.yieldRange).toEqual([0, 15])
    expect(result.current.sortOrder).toBe('asc')
    expect(result.current.sortDirection).toBe('asc')
  })

  it('initializes from URL query parameters (bookmark/share link)', () => {
    window.history.replaceState(
      null,
      '',
      'http://localhost:3000/portfolio?sortOrder=desc&yieldRange=4-10',
    )
    const { result } = renderHook(() => useBondFilters())
    expect(result.current.sortOrder).toBe('desc')
    expect(result.current.sortDirection).toBe('desc')
    expect(result.current.yieldRange).toEqual([4, 10])
  })

  it('updates sortOrder and persists to URL and storage', () => {
    const { result } = renderHook(() => useBondFilters())
    act(() => {
      result.current.setSortOrder('desc')
    })
    expect(result.current.sortOrder).toBe('desc')
    expect(result.current.sortDirection).toBe('desc')
    expect(window.location.search).toContain('sortOrder=desc')
    expect(localStorage.getItem('bond_sort_order')).toBe('desc')
  })

  it('updates sortDirection via setSortDirection alias', () => {
    const { result } = renderHook(() => useBondFilters())
    act(() => {
      result.current.setSortDirection('desc')
    })
    expect(result.current.sortOrder).toBe('desc')
    expect(window.location.search).toContain('sortOrder=desc')
  })

  it('updates yieldRange and persists to URL and storage', () => {
    const { result } = renderHook(() => useBondFilters())
    act(() => {
      result.current.setYieldRange([4, 10])
    })
    expect(result.current.yieldRange).toEqual([4, 10])
    expect(window.location.search).toContain('yieldRange=4-10')
    expect(localStorage.getItem('bond_yield_filter')).toBe(JSON.stringify([4, 10]))
  })

  it('syncs yieldRange across storage events (tab switches)', () => {
    const { result } = renderHook(() => useBondFilters())
    expect(result.current.yieldRange).toEqual([0, 15])

    act(() => {
      localStorage.setItem('bond_yield_filter', JSON.stringify([3, 11]))
      window.dispatchEvent(new Event('storage'))
    })
    expect(result.current.yieldRange).toEqual([3, 11])
  })

  it('retains filter state when navigating away and back (unmount and remount)', () => {
    const { result, unmount } = renderHook(() => useBondFilters())
    act(() => {
      result.current.setYieldRange([5, 12])
    })
    expect(result.current.yieldRange).toEqual([5, 12])

    // User clicks on a bond, navigating away
    unmount()
    window.history.pushState(null, '', 'http://localhost:3000/bonds/123')

    // User goes back to portfolio list
    window.history.replaceState(null, '', 'http://localhost:3000/portfolio')
    const { result: remounted } = renderHook(() => useBondFilters())
    expect(remounted.current.yieldRange).toEqual([5, 12])
  })

  it('syncs filter state on popstate event (browser back/forward navigation)', () => {
    const { result } = renderHook(() => useBondFilters())
    expect(result.current.yieldRange).toEqual([0, 15])

    act(() => {
      window.history.replaceState(
        null,
        '',
        'http://localhost:3000/portfolio?yieldRange=6-14&sortOrder=desc',
      )
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(result.current.yieldRange).toEqual([6, 14])
    expect(result.current.sortOrder).toBe('desc')
  })
})
