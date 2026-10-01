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
