import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FAST_INTERVAL_MS,
  horizonHealthPoller,
  REQUEST_TIMEOUT_MS,
  SLOW_INTERVAL_MS,
  useHorizonHealth,
} from './useHorizonHealth'
import { HORIZON_URL } from '../config/network'

const setVisibility = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

const setNavigatorOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
}

describe('useHorizonHealth', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility(false)
    setNavigatorOnline(true)
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch
    horizonHealthPoller.resetForTesting()
  })

  afterEach(() => {
    horizonHealthPoller.resetForTesting()
    vi.useRealTimers()
    setVisibility(false)
    setNavigatorOnline(true)
    vi.restoreAllMocks()
  })

  it('performs an initial health check on mount and reports online on 200 OK', async () => {
    const { result, unmount } = renderHook(() => useHorizonHealth())

    expect(result.current.isOnline).toBe(true)
    expect(result.current.isHealthy).toBe(true)

    // Initial check runs
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      HORIZON_URL,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    )

    unmount()
  })

  it('backs off polling interval from 15s to 60s after consecutive successes', async () => {
    const { unmount } = renderHook(() => useHorizonHealth())

    // Initial check (success #1)
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Advance by fast interval (15s) -> triggers success #2 (reaches BACKOFF_THRESHOLD = 2)
    await act(async () => {
      vi.advanceTimersByTime(FAST_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // Advance by 15s: should NOT trigger another fetch because it has backed off to 60s
    await act(async () => {
      vi.advanceTimersByTime(FAST_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // Advance remaining time to complete 60s total (60s - 15s = 45s)
    await act(async () => {
      vi.advanceTimersByTime(SLOW_INTERVAL_MS - FAST_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(3)

    unmount()
  })

  it('resets interval back to 15s after a failure and marks offline on HTTP error or timeout', async () => {
    const { result, unmount } = renderHook(() => useHorizonHealth())

    // Check #1 (success)
    await act(async () => {
      await Promise.resolve()
    })
    // Check #2 (success -> backoff to 60s)
    await act(async () => {
      vi.advanceTimersByTime(FAST_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // Next check fails (HTTP 500)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await act(async () => {
      vi.advanceTimersByTime(SLOW_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result.current.isOnline).toBe(false)
    expect(result.current.isHealthy).toBe(false)

    // Next check should happen at fast interval (15s), NOT backed-off 60s
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    })

    await act(async () => {
      vi.advanceTimersByTime(FAST_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(result.current.isOnline).toBe(true)

    unmount()
  })

  it('pauses polling when tab is hidden and sends no requests while hidden', async () => {
    const { unmount } = renderHook(() => useHorizonHealth())

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Hide tab
    act(() => {
      setVisibility(true)
    })

    // Advance 5 minutes while hidden
    await act(async () => {
      vi.advanceTimersByTime(300_000)
      await Promise.resolve()
    })

    // Zero additional requests made while hidden
    expect(mockFetch).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('resumes and re-checks immediately when tab becomes visible again', async () => {
    const { unmount } = renderHook(() => useHorizonHealth())

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Hide tab
    act(() => {
      setVisibility(true)
    })
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Return to tab
    await act(async () => {
      setVisibility(false)
      await Promise.resolve()
    })

    // Re-check immediately triggered upon becoming visible (success #2 -> backed off to 60s)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // Does not fire at 15s because it backed off after 2 consecutive successes
    await act(async () => {
      vi.advanceTimersByTime(FAST_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // Subsequent polling continues at 60s
    await act(async () => {
      vi.advanceTimersByTime(SLOW_INTERVAL_MS - FAST_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(3)

    unmount()
  })

  it('handles window offline and online events immediately', async () => {
    const { result, unmount } = renderHook(() => useHorizonHealth())

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.isOnline).toBe(true)

    // Window offline event
    act(() => {
      setNavigatorOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.isOnline).toBe(false)

    // While offline, timers should not poll
    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Window online event
    setNavigatorOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    // Re-checks immediately on online event
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.current.isOnline).toBe(true)

    unmount()
  })

  it('shares a single poller across multiple mounted consumers', async () => {
    const hook1 = renderHook(() => useHorizonHealth())
    const hook2 = renderHook(() => useHorizonHealth())

    await act(async () => {
      await Promise.resolve()
    })

    // Exactly one initial fetch, not two
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(hook1.result.current.isOnline).toBe(true)
    expect(hook2.result.current.isOnline).toBe(true)

    // Advance timers
    await act(async () => {
      vi.advanceTimersByTime(FAST_INTERVAL_MS)
      await Promise.resolve()
    })

    // Exactly one second fetch
    expect(mockFetch).toHaveBeenCalledTimes(2)

    hook1.unmount()
    hook2.unmount()

    // Cleaned up after all consumers unmount
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up in-flight requests and timers when completely unmounted', async () => {
    let abortListenerTriggered = false
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise(() => {
          init?.signal?.addEventListener('abort', () => {
            abortListenerTriggered = true
          })
        }),
    )

    const { unmount } = renderHook(() => useHorizonHealth())

    // Fetch is started and pending
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Unmount
    unmount()

    // Signal should have aborted in-flight request
    expect(abortListenerTriggered).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts requests that exceed REQUEST_TIMEOUT_MS and marks offline', async () => {
    let aborted = false
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )

    const { result, unmount } = renderHook(() => useHorizonHealth())

    expect(result.current.isOnline).toBe(true)

    // Advance to trigger timeout (3000ms)
    await act(async () => {
      vi.advanceTimersByTime(REQUEST_TIMEOUT_MS)
      await Promise.resolve()
    })

    expect(aborted).toBe(true)
    expect(result.current.isOnline).toBe(false)

    unmount()
  })

  it('allows manual checkHealth invocation', async () => {
    const { result, unmount } = renderHook(() => useHorizonHealth())

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Call checkHealth manually
    let status = false
    await act(async () => {
      status = await result.current.checkHealth()
    })

    expect(status).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    unmount()
  })

  it('guarantees TopBar indicator and offline banner consumers always agree', async () => {
    function TopBarIndicator() {
      const { isOnline } = useHorizonHealth()
      return <div data-testid="topbar">{isOnline ? 'online' : 'offline'}</div>
    }

    function OfflineBannerConsumer() {
      const { isOnline } = useHorizonHealth()
      return <div data-testid="banner">{isOnline ? 'online' : 'offline'}</div>
    }

    function App() {
      return (
        <div>
          <TopBarIndicator />
          <OfflineBannerConsumer />
        </div>
      )
    }

    const { getByTestId, unmount } = render(<App />)

    expect(getByTestId('topbar')).toHaveTextContent('online')
    expect(getByTestId('banner')).toHaveTextContent('online')

    // Initial check runs
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(getByTestId('topbar')).toHaveTextContent('online')
    expect(getByTestId('banner')).toHaveTextContent('online')

    // Next check fails (HTTP 503)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await act(async () => {
      vi.advanceTimersByTime(FAST_INTERVAL_MS)
      await Promise.resolve()
    })

    // Both indicators agree they are offline
    expect(getByTestId('topbar')).toHaveTextContent('offline')
    expect(getByTestId('banner')).toHaveTextContent('offline')

    // Recovered
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await act(async () => {
      vi.advanceTimersByTime(FAST_INTERVAL_MS)
      await Promise.resolve()
    })

    // Both indicators agree they are online
    expect(getByTestId('topbar')).toHaveTextContent('online')
    expect(getByTestId('banner')).toHaveTextContent('online')

    unmount()
  })
})
