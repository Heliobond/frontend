/**
 * The bond yield filter and its external store (#598).
 *
 * `useBondFilters` reads the range through `useSyncExternalStore`, so the
 * invariants that matter are a stable snapshot, notification on write, and
 * picking up changes made in another tab.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getServerYieldRange,
  getYieldRange,
  setYieldRange,
  subscribeYieldRange,
  getPersistedYieldRange,
  getSortOrder,
  setSortOrder,
  subscribeSortOrder,
} from './bondUtils'

const RANGE: [number, number] = [3, 9]

describe('bond yield range store', () => {
  beforeEach(() => {
    localStorage.clear()
    // The hook writes the range into the query string too; keep the URL clean.
    window.history.replaceState(null, '', '/')
  })

  it('falls back to the default range when nothing is stored', () => {
    expect(getPersistedYieldRange()).toEqual([0, 15])
  })

  it('reports the default on the server so hydration matches', () => {
    expect(getServerYieldRange()).toEqual([0, 15])
  })

  it('persists a saved range', () => {
    setYieldRange(RANGE)
    expect(getPersistedYieldRange()).toEqual(RANGE)
  })

  it('reflects the saved range in the query string', () => {
    setYieldRange(RANGE)
    expect(new URL(window.location.href).searchParams.get('yieldRange')).toBe('3-9')
  })

  it('prefers the query string over storage', () => {
    window.history.replaceState(null, '', '/?yieldRange=1-4')
    setYieldRange([8, 12])
    // setYieldRange rewrites the URL, so re-assert the override to prove precedence.
    window.history.replaceState(null, '', '/?yieldRange=1-4')
    expect(getPersistedYieldRange()).toEqual([1, 4])
  })

  it('ignores a malformed query string', () => {
    window.history.replaceState(null, '', '/?yieldRange=abc-def')
    expect(getPersistedYieldRange()).toEqual([0, 15])
  })

  it('restores ?yieldRange=2-8 URL param and falls back to stored range', () => {
    window.history.replaceState(null, '', '/?yieldRange=2-8')
    expect(getPersistedYieldRange()).toEqual([2, 8])

    // Fall back to storage when URL has no range
    window.localStorage.setItem('bond_yield_filter', JSON.stringify([5, 10]))
    window.history.replaceState(null, '', '/')
    expect(getPersistedYieldRange()).toEqual([5, 10])

    // Inverted range in URL falls back to storage
    window.history.replaceState(null, '', '/?yieldRange=12-3')
    expect(getPersistedYieldRange()).toEqual([5, 10])
  })

  it('notifies subscribers when the range changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeYieldRange(listener)
    setYieldRange(RANGE)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getYieldRange()).toEqual(RANGE)
    unsubscribe()
  })

  it('reads storage on first subscribe', () => {
    setYieldRange(RANGE)
    const unsubscribe = subscribeYieldRange(() => {})
    expect(getYieldRange()).toEqual(RANGE)
    unsubscribe()
  })

  it('keeps the snapshot referentially stable between writes', () => {
    const unsubscribe = subscribeYieldRange(() => {})
    const first = getYieldRange()
    expect(getYieldRange()).toBe(first)
    unsubscribe()
  })

  it('picks up a range changed in another tab', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeYieldRange(listener)
    window.localStorage.setItem('bond_yield_filter', JSON.stringify([2, 7]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'bond_yield_filter' }))
    expect(listener).toHaveBeenCalled()
    expect(getYieldRange()).toEqual([2, 7])
    unsubscribe()
  })

  it('ignores storage events for unrelated keys', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeYieldRange(listener)
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-key' }))
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('re-reads storage when the tab becomes visible again', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeYieldRange(listener)
    window.localStorage.setItem('bond_yield_filter', JSON.stringify([4, 11]))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(listener).toHaveBeenCalled()
    expect(getYieldRange()).toEqual([4, 11])
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeYieldRange(listener)
    unsubscribe()
    setYieldRange(RANGE)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('shared browser listeners across consumers (#1040)', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
  })

  it('keeps propagating browser navigation to a remaining yield-range consumer', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = subscribeYieldRange(first)
    const unsubscribeSecond = subscribeYieldRange(second)

    unsubscribeFirst()
    window.history.replaceState(null, '', '/?yieldRange=4-6')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(getYieldRange()).toEqual([4, 6])
    unsubscribeSecond()
  })

  it('keeps propagating storage and visibility updates to a remaining consumer', () => {
    const unsubscribeFirst = subscribeYieldRange(() => {})
    const second = vi.fn()
    const unsubscribeSecond = subscribeYieldRange(second)
    unsubscribeFirst()

    localStorage.setItem('bond_yield_filter', JSON.stringify([2, 5]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'bond_yield_filter' }))
    expect(getYieldRange()).toEqual([2, 5])

    localStorage.setItem('bond_yield_filter', JSON.stringify([3, 8]))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getYieldRange()).toEqual([3, 8])
    expect(second).toHaveBeenCalledTimes(2)
    unsubscribeSecond()
  })

  it('attaches the shared listeners once and removes them only on the last unsubscribe', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const count = (spy: typeof add, type: string) =>
      spy.mock.calls.filter(([t]) => t === type).length

    const unsubscribeFirst = subscribeYieldRange(() => {})
    const unsubscribeSecond = subscribeYieldRange(() => {})
    expect(count(add, 'popstate')).toBe(1)
    expect(count(add, 'storage')).toBe(1)
    expect(count(add, 'pageshow')).toBe(1)

    unsubscribeFirst()
    expect(count(remove, 'popstate')).toBe(0)

    unsubscribeSecond()
    expect(count(remove, 'popstate')).toBe(1)
    expect(count(remove, 'storage')).toBe(1)
    expect(count(remove, 'pageshow')).toBe(1)
  })

  it('stops reacting to browser events after the last consumer is gone', () => {
    const listener = vi.fn()
    subscribeYieldRange(listener)()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).not.toHaveBeenCalled()
  })

  it('reads current state on a later mount after every consumer unmounted', () => {
    const unsubscribe = subscribeYieldRange(() => {})
    unsubscribe()

    // Changed while nobody was listening.
    window.history.replaceState(null, '', '/?yieldRange=7-9')

    const remount = subscribeYieldRange(() => {})
    expect(getYieldRange()).toEqual([7, 9])
    remount()
  })

  it('ignores a repeated unsubscribe so it cannot detach other consumers', () => {
    const unsubscribeFirst = subscribeYieldRange(() => {})
    const second = vi.fn()
    const unsubscribeSecond = subscribeYieldRange(second)

    unsubscribeFirst()
    unsubscribeFirst()
    window.history.replaceState(null, '', '/?yieldRange=1-2')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(second).toHaveBeenCalledTimes(1)
    unsubscribeSecond()
  })

  it('treats the same function subscribed twice as two consumers', () => {
    const shared = vi.fn()
    const a = subscribeYieldRange(shared)
    const b = subscribeYieldRange(shared)
    a()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(shared).toHaveBeenCalledTimes(1)
    b()
  })

  it('applies the same last-consumer rule to the sort-order store', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = subscribeSortOrder(first)
    const unsubscribeSecond = subscribeSortOrder(second)

    unsubscribeFirst()
    window.history.replaceState(null, '', '/?sortOrder=desc')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(getSortOrder()).toBe('desc')

    unsubscribeSecond()
    window.history.replaceState(null, '', '/?sortOrder=asc')
    const remount = subscribeSortOrder(() => {})
    expect(getSortOrder()).toBe('asc')
    remount()
  })
})

describe('invalid yield ranges are rejected before publishing (#1041)', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it.each([
    ['inverted', [9, 3]],
    ['negative minimum', [-1, 5]],
    ['NaN bound', [Number.NaN, 5]],
    ['infinite bound', [0, Number.POSITIVE_INFINITY]],
    ['wrong length', [1, 2, 3]],
  ])('leaves the snapshot, subscribers and storage untouched for an %s range', (_label, bad) => {
    setYieldRange([4, 8])
    const listener = vi.fn()
    const unsubscribe = subscribeYieldRange(listener)
    const storedBefore = localStorage.getItem('bond_yield_filter')
    const urlBefore = window.location.href

    setYieldRange(bad as [number, number])

    expect(getYieldRange()).toEqual([4, 8])
    expect(listener).not.toHaveBeenCalled()
    expect(localStorage.getItem('bond_yield_filter')).toBe(storedBefore)
    expect(window.location.href).toBe(urlBefore)
    // What a reload would restore is what mounted consumers see.
    expect(getPersistedYieldRange()).toEqual(getYieldRange())
    unsubscribe()
  })

  it('updates subscribers and the persisted representation together for a valid range', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeYieldRange(listener)

    setYieldRange([2, 11])

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getYieldRange()).toEqual([2, 11])
    expect(JSON.parse(localStorage.getItem('bond_yield_filter') as string)).toEqual([2, 11])
    expect(new URL(window.location.href).searchParams.get('yieldRange')).toBe('2-11')
    expect(getPersistedYieldRange()).toEqual([2, 11])
    unsubscribe()
  })

  it('accepts the boundary values 0 and equal bounds', () => {
    setYieldRange([0, 0])
    expect(getYieldRange()).toEqual([0, 0])
    setYieldRange([5, 5])
    expect(getYieldRange()).toEqual([5, 5])
  })

  it('does not disturb the sort-order store', () => {
    const unsubscribe = subscribeSortOrder(() => {})
    setSortOrder('desc')
    setYieldRange([9, 3])
    expect(getSortOrder()).toBe('desc')
    unsubscribe()
  })
})
