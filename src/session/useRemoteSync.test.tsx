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
})
