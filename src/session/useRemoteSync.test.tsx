import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRemoteSync } from './useRemoteSync'

let mockSession: unknown = null

vi.mock('./SessionProvider', () => ({
  useOptionalSession: () => mockSession,
}))

beforeEach(() => {
  mockSession = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRemoteSync', () => {
  it('stays local while signed out', () => {
    const apply = vi.fn()
    const { rerender } = renderHook(
      ({ value }) =>
        useRemoteSync({ resource: 'watchlist', value, apply, merge: (local) => local }),
      { initialProps: { value: ['local'] } },
    )
    rerender({ value: ['changed'] })
    expect(apply).not.toHaveBeenCalled()
  })

  it('merges the first server read and pushes local additions', async () => {
    const authedFetch = vi.fn().mockResolvedValueOnce(['server']).mockResolvedValueOnce(undefined)
    mockSession = { isAuthenticated: true, address: 'G-ADDRESS', authedFetch }
    const apply = vi.fn()
    renderHook(() =>
      useRemoteSync({
        resource: 'watchlist',
        value: ['local'],
        apply,
        merge: (local, remote) => [...new Set([...remote, ...local])],
      }),
    )

    await waitFor(() => expect(authedFetch).toHaveBeenCalledTimes(2))
    expect(authedFetch).toHaveBeenNthCalledWith(1, '/me/watchlist')
    expect(apply).toHaveBeenCalledWith(['server', 'local'])
    expect(authedFetch).toHaveBeenNthCalledWith(2, '/me/watchlist', {
      method: 'PUT',
      body: ['server', 'local'],
    })
  })

  it('debounces subsequent local changes', async () => {
    const authedFetch = vi.fn().mockResolvedValueOnce([]).mockResolvedValue(undefined)
    mockSession = { isAuthenticated: true, address: 'G-ADDRESS', authedFetch }
    const { rerender } = renderHook(
      ({ value }) =>
        useRemoteSync({ resource: 'watchlist', value, apply: vi.fn(), merge: (local) => local }),
      { initialProps: { value: ['first'] } },
    )

    await waitFor(() => expect(authedFetch).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()
    rerender({ value: ['second'] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(authedFetch).toHaveBeenLastCalledWith('/me/watchlist', {
      method: 'PUT',
      body: ['second'],
    })
  })

  it('retries a failed initial pull, then syncs later edits', async () => {
    vi.useFakeTimers()
    const authedFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([])
      .mockResolvedValue(undefined)
    mockSession = { isAuthenticated: true, address: 'G-ADDRESS', authedFetch }
    const apply = vi.fn()
    const { result, rerender } = renderHook(
      ({ value }) =>
        useRemoteSync({ resource: 'watchlist', value, apply, merge: (local) => local }),
      { initialProps: { value: ['first'] } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(authedFetch).toHaveBeenCalledTimes(1)
    expect(result.current.hydrated).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current).toEqual({ hydrated: true, syncFailed: false })

    rerender({ value: ['second'] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(authedFetch).toHaveBeenLastCalledWith('/me/watchlist', {
      method: 'PUT',
      body: ['second'],
    })
  })

  it('reports syncFailed when every pull attempt fails', async () => {
    vi.useFakeTimers()
    const authedFetch = vi.fn().mockRejectedValue(new Error('down'))
    mockSession = { isAuthenticated: true, address: 'G-ADDRESS', authedFetch }
    const { result } = renderHook(() =>
      useRemoteSync({ resource: 'watchlist', value: [], apply: vi.fn(), merge: (local) => local }),
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(authedFetch).toHaveBeenCalledTimes(5)
    expect(result.current).toEqual({ hydrated: false, syncFailed: true })
  })

  it('lands two quick edits in order, so the last edit wins', async () => {
    vi.useFakeTimers()
    const resolvers: Array<() => void> = []
    const authedFetch = vi.fn((_path: string, init?: { method: string }) => {
      if (init?.method !== 'PUT') return Promise.resolve(['start'])
      return new Promise<void>((resolve) => resolvers.push(resolve))
    })
    mockSession = { isAuthenticated: true, address: 'G-ADDRESS', authedFetch }
    const { rerender } = renderHook(
      ({ value }) =>
        useRemoteSync({ resource: 'watchlist', value, apply: vi.fn(), merge: (local) => local }),
      { initialProps: { value: ['start'] } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    rerender({ value: ['a'] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    rerender({ value: ['b'] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    // The second PUT waits for the first to finish.
    const puts = () => authedFetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(puts()).toHaveLength(1)
    expect(puts()[0][1]).toEqual({ method: 'PUT', body: ['a'] })

    await act(async () => {
      resolvers[0]()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(puts()).toHaveLength(2)
    expect(puts()[1][1]).toEqual({ method: 'PUT', body: ['b'] })
  })
})
