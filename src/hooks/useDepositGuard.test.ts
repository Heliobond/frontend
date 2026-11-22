import { describe, it, expect, beforeEach, vi } from '@/test/bun'
import { renderHook, act } from '@testing-library/react'
import { useDepositGuard } from './useDepositGuard'

describe('useDepositGuard', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useRealTimers()
  })

  it('returns null when no pending deposit exists', () => {
    const { result } = renderHook(() => useDepositGuard())
    expect(result.current.getPending()).toBeNull()
  })

  it('stores a pending deposit record via markPending', () => {
    const { result } = renderHook(() => useDepositGuard())
    act(() => {
      result.current.markPending(100, 'GADDRESS123')
    })
    const pending = result.current.getPending()
    expect(pending).not.toBeNull()
    expect(pending?.amount).toBe(100)
    expect(pending?.address).toBe('GADDRESS123')
    expect(typeof pending?.startedAt).toBe('number')
  })

  it('clearPending removes the record', () => {
    const { result } = renderHook(() => useDepositGuard())
    act(() => {
      result.current.markPending(250, 'GADDRESS456')
    })
    expect(result.current.getPending()).not.toBeNull()
    act(() => {
      result.current.clearPending()
    })
    expect(result.current.getPending()).toBeNull()
  })

  it('getPending returns null for an expired record (past 5 min TTL)', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDepositGuard())
    act(() => {
      result.current.markPending(50, 'GADDRESS789')
    })
    // Advance past the 5-minute TTL
    vi.advanceTimersByTime(6 * 60 * 1000)
    expect(result.current.getPending()).toBeNull()
    vi.useRealTimers()
  })

  it('markPending overwrites a previous pending record', () => {
    const { result } = renderHook(() => useDepositGuard())
    act(() => {
      result.current.markPending(100, 'GADDRESS_A')
    })
    act(() => {
      result.current.markPending(200, 'GADDRESS_B')
    })
    const pending = result.current.getPending()
    expect(pending?.amount).toBe(200)
    expect(pending?.address).toBe('GADDRESS_B')
  })

  it('handles sessionStorage.setItem throwing without crashing the hook', () => {
    // Simulate a browser where sessionStorage.setItem throws (e.g. private mode quota)
    vi.spyOn(sessionStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useDepositGuard())
    // markPending must not propagate the storage error to the caller
    expect(() => {
      act(() => {
        result.current.markPending(100, 'GADDRESS')
      })
    }).not.toThrow()
  })

  it('handles sessionStorage.getItem throwing without crashing the hook', () => {
    const { result } = renderHook(() => useDepositGuard())
    vi.spyOn(sessionStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('SecurityError')
    })
    // getPending must return null rather than throwing
    expect(result.current.getPending()).toBeNull()
  })
})
