import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionTimeout } from './useSessionTimeout'

describe('useSessionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes in active state without warning open', () => {
    const { result } = renderHook(() =>
      useSessionTimeout({
        timeoutMs: 10000,
        warningMs: 2000,
        throttleMs: 100,
      }),
    )

    expect(result.current.isWarningOpen).toBe(false)
    expect(result.current.remainingSeconds).toBe(2)
    expect(result.current.formattedRemaining).toBe('0:02')
  })

  it('triggers warning when idle threshold is reached', () => {
    const onWarning = vi.fn()
    const onTimeout = vi.fn()

    const { result } = renderHook(() =>
      useSessionTimeout({
        timeoutMs: 10000,
        warningMs: 3000,
        throttleMs: 100,
        onWarning,
        onTimeout,
      }),
    )

    // Fast-forward to warning threshold (10s - 3s = 7s)
    act(() => {
      vi.advanceTimersByTime(7000)
    })

    expect(result.current.isWarningOpen).toBe(true)
    expect(onWarning).toHaveBeenCalledTimes(1)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('counts down remaining seconds during warning phase and triggers timeout on zero', () => {
    const onTimeout = vi.fn()

    const { result } = renderHook(() =>
      useSessionTimeout({
        timeoutMs: 10000,
        warningMs: 3000,
        onTimeout,
      }),
    )

    // Advance to warning (7s)
    act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(result.current.isWarningOpen).toBe(true)
    expect(result.current.remainingSeconds).toBe(3)
    expect(result.current.formattedRemaining).toBe('0:03')

    // Advance 1s
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.remainingSeconds).toBe(2)
    expect(result.current.formattedRemaining).toBe('0:02')

    // Advance remaining 2s -> reaches 0 and triggers timeout
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.isWarningOpen).toBe(false)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('resets timer when user clicks extendSession', () => {
    const onTimeout = vi.fn()

    const { result } = renderHook(() =>
      useSessionTimeout({
        timeoutMs: 10000,
        warningMs: 3000,
        onTimeout,
      }),
    )

    // Advance to warning
    act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(result.current.isWarningOpen).toBe(true)

    // User extends session
    act(() => {
      result.current.extendSession()
    })

    expect(result.current.isWarningOpen).toBe(false)

    // Advance 5s (total 12s from start, but 5s from extension -> should not timeout)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.isWarningOpen).toBe(false)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('triggers onTimeout immediately when expireNow is called', () => {
    const onTimeout = vi.fn()

    const { result } = renderHook(() =>
      useSessionTimeout({
        timeoutMs: 10000,
        warningMs: 3000,
        onTimeout,
      }),
    )

    act(() => {
      result.current.expireNow()
    })

    expect(result.current.isWarningOpen).toBe(false)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('resets warning timer on user activity event when not in warning state', () => {
    const onWarning = vi.fn()

    const { result } = renderHook(() =>
      useSessionTimeout({
        timeoutMs: 10000,
        warningMs: 3000,
        throttleMs: 500,
        onWarning,
      }),
    )

    // Advance 5s (warning would normally trigger at 7s)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.isWarningOpen).toBe(false)

    // Simulate user activity event
    act(() => {
      window.dispatchEvent(new Event('mousemove'))
    })

    // Advance another 5s (total 10s from start, but 5s from last activity)
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // Warning should NOT have fired yet because user moved mouse at 5s
    expect(result.current.isWarningOpen).toBe(false)
    expect(onWarning).not.toHaveBeenCalled()

    // Advance 2s more (7s from mousemove) -> now warning fires
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.isWarningOpen).toBe(true)
    expect(onWarning).toHaveBeenCalledTimes(1)
  })

  it('cleans up all timers when enabled becomes false', () => {
    const onTimeout = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }) =>
        useSessionTimeout({
          timeoutMs: 5000,
          warningMs: 1000,
          enabled,
          onTimeout,
        }),
      { initialProps: { enabled: true } },
    )

    // Disable monitoring
    rerender({ enabled: false })

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(onTimeout).not.toHaveBeenCalled()
  })
})
