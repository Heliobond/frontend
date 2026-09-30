import { act, render, waitFor } from '@testing-library/react'
import { useEffect, useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const WALLET_ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'

const signMessage = vi.fn(async () => 'signed-message')
const sign = vi.fn(async () => 'signed-xdr')

/**
 * Reactive stand-in for the wallet context. Tests change the address to simulate
 * a disconnect or an account switch, which must re-render `SessionProvider`.
 */
function createWalletMock() {
  let snapshot = { address: WALLET_ADDRESS as string | null, isDemo: false }
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get: () => snapshot,
    setAddress: (address: string | null) => {
      snapshot = { ...snapshot, address }
      listeners.forEach((listener) => listener())
    },
    signMessage,
    sign,
  }
}

const walletMock = createWalletMock()

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => {
    useSyncExternalStore(walletMock.subscribe, walletMock.get, walletMock.get)
    return {
      address: walletMock.get().address,
      isDemo: walletMock.get().isDemo,
      signMessage,
      sign,
    }
  },
}))

import { SessionProvider, useSession, type SessionContextValue } from './SessionProvider'

/**
 * Latest context value observed by the probe. Assigned in an effect rather than
 * during render, so the probe stays pure (#598).
 */
let session: SessionContextValue
function Probe() {
  const value = useSession()
  useEffect(() => {
    session = value
  }, [value])
  return null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function defer<T>() {
  let resolve!: (val: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('SessionProvider', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    signMessage.mockClear()
    sign.mockClear()
    // Restore the connected wallet; some tests disconnect or switch address.
    walletMock.setAddress(WALLET_ADDRESS)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('signs in with a SEP-53 message signature and keeps the token out of storage', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return json({}, 401)
      if (url.endsWith('/auth/challenge')) return json({ type: 'message', challenge: 'hello G...' })
      if (url.endsWith('/auth/verify')) return json({ token: 'jwt-1', expiresIn: 900 })
      if (url.endsWith('/me/watchlist')) return json([1, 2])
      return json({}, 404)
    })

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.isAuthenticated).toBe(true))
    expect(signMessage).toHaveBeenCalledWith('hello G...')
    const verifyBody = JSON.parse(
      fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/verify'))![1].body,
    )
    expect(verifyBody).toMatchObject({
      address: walletMock.get().address,
      signature: 'signed-message',
    })

    // Authenticated call carries the bearer token.
    const data = await act(() => session.authedFetch<number[]>('/me/watchlist'))
    expect(data).toEqual([1, 2])
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/me/watchlist'))!
    expect(call[1].headers.Authorization).toBe('Bearer jwt-1')

    expect(JSON.stringify({ ...localStorage })).not.toContain('jwt-1')
  })

  it('restores silently through the refresh cookie without a wallet prompt', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-2', expiresIn: 900 }) : json({}, 404),
    )
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(session.isAuthenticated).toBe(true))
    expect(signMessage).not.toHaveBeenCalled()
  })

  it('is unavailable when no backend is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', '')
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    expect(session.status).toBe('unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Acceptance criterion 1: Three concurrent authedFetch calls that get a 401 cause exactly one /auth/refresh request
  it('collapses three concurrent 401s into a single /auth/refresh request and retries all three', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-1', expiresIn: 900 }) : json({}, 404),
    )

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    const refreshDeferred = defer<Response>()
    let refreshCallCount = 0

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCallCount++
        return refreshDeferred.promise
      }

      const authHeader = (init?.headers as Record<string, string>)?.Authorization
      if (authHeader === 'Bearer jwt-1') {
        return json({ error: 'Token expired' }, 401)
      }
      if (authHeader === 'Bearer jwt-2') {
        if (url.endsWith('/me/watchlist')) return json([1, 2])
        if (url.endsWith('/me/recurring-investments')) return json([{ id: 'plan-1' }])
        if (url.endsWith('/me/yield-alerts')) return json([{ id: 'alert-1' }])
      }
      return json({}, 404)
    })

    const pWatchlist = session.authedFetch<number[]>('/me/watchlist')
    const pRecurring = session.authedFetch<{ id: string }[]>('/me/recurring-investments')
    const pAlerts = session.authedFetch<{ id: string }[]>('/me/yield-alerts')

    await waitFor(() => expect(refreshCallCount).toBe(1))

    let results: [number[], { id: string }[], { id: string }[]] | undefined
    await act(async () => {
      refreshDeferred.resolve(json({ token: 'jwt-2', expiresIn: 900 }))
      results = await Promise.all([pWatchlist, pRecurring, pAlerts])
    })

    expect(results).toEqual([[1, 2], [{ id: 'plan-1' }], [{ id: 'alert-1' }]])
    expect(refreshCallCount).toBe(1)
    expect(session.isAuthenticated).toBe(true)
  })

  // Acceptance criterion 2: A timer refresh overlapping a 401 retry does not clear the session
  it('does not clear session when a timer refresh overlaps with a 401 retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fetchMock.mockImplementation(async (url: string) =>
        url.endsWith('/auth/refresh') ? json({ token: 'jwt-1', expiresIn: 900 }) : json({}, 404),
      )

      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      )

      await waitFor(() => expect(session.isAuthenticated).toBe(true))

      const refreshDeferred = defer<Response>()
      let refreshCallCount = 0

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/auth/refresh')) {
          refreshCallCount++
          return refreshDeferred.promise
        }

        const authHeader = (init?.headers as Record<string, string>)?.Authorization
        if (authHeader === 'Bearer jwt-1') {
          return json({ error: 'Token expired' }, 401)
        }
        if (authHeader === 'Bearer jwt-2') {
          return json({ data: 'ok' })
        }
        return json({}, 404)
      })

      // Advance fake timers so the expiry timer fires
      await act(async () => {
        await vi.advanceTimersByTimeAsync(850_000)
      })

      expect(refreshCallCount).toBe(1)

      // Overlapping 401 call joins the in-flight refresh
      let fetchResult: { data: string } | undefined
      const fetchPromise = session.authedFetch<{ data: string }>('/me/test').then((r) => {
        fetchResult = r
      })

      await act(async () => {
        refreshDeferred.resolve(json({ token: 'jwt-2', expiresIn: 900 }))
        await fetchPromise
      })

      expect(fetchResult).toEqual({ data: 'ok' })
      expect(refreshCallCount).toBe(1)
      expect(session.isAuthenticated).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  // Acceptance criterion 3: A genuine refresh failure still signs the user out exactly once
  it('signs the user out exactly once on genuine refresh failure', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-1', expiresIn: 900 }) : json({}, 404),
    )

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    let refreshCallCount = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCallCount++
        return json({ error: 'Refresh cookie revoked' }, 401)
      }
      if (url.startsWith('https://api.test/me/')) {
        return json({ error: 'Token expired' }, 401)
      }
      return json({}, 404)
    })

    const results = await act(async () => {
      return await Promise.allSettled([
        session.authedFetch('/me/a'),
        session.authedFetch('/me/b'),
        session.authedFetch('/me/c'),
      ])
    })

    // All three rejected
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    expect(refreshCallCount).toBe(1)

    await waitFor(() => {
      expect(session.isAuthenticated).toBe(false)
      expect(session.status).toBe('signed-out')
      expect(session.address).toBeNull()
    })
  })

  it('allows sequential refreshes after previous refresh promise has settled', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-1', expiresIn: 900 }) : json({}, 404),
    )

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    let currentValidToken = 'jwt-1'
    let refreshCount = 0

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount++
        currentValidToken = `jwt-${refreshCount + 1}`
        return json({ token: currentValidToken, expiresIn: 900 })
      }
      const authHeader = (init?.headers as Record<string, string>)?.Authorization
      if (authHeader !== `Bearer ${currentValidToken}`) {
        return json({ error: 'Expired' }, 401)
      }
      return json({ ok: true, token: currentValidToken })
    })

    // First request triggers refresh 1 -> token becomes jwt-2
    currentValidToken = 'invalid-1'
    const res1 = await act(() => session.authedFetch<{ ok: boolean; token: string }>('/me/first'))
    expect(res1.token).toBe('jwt-2')
    expect(refreshCount).toBe(1)

    // Later, second request triggers refresh 2 -> token becomes jwt-3
    currentValidToken = 'invalid-2'
    const res2 = await act(() => session.authedFetch<{ ok: boolean; token: string }>('/me/second'))
    expect(res2.token).toBe('jwt-3')
    expect(refreshCount).toBe(2)
  })

  it('retries once with the new token without refreshing if token changed while request was in flight', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-1', expiresIn: 900 }) : json({}, 404),
    )

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    let refreshCalls = 0
    const requestADeferred = defer<Response>()

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++
        return json({ token: 'jwt-2', expiresIn: 900 })
      }
      const authHeader = (init?.headers as Record<string, string>)?.Authorization
      if (url.endsWith('/me/slow')) {
        if (authHeader === 'Bearer jwt-1') {
          return requestADeferred.promise
        }
        if (authHeader === 'Bearer jwt-2') {
          return json({ success: true })
        }
      }
      if (url.endsWith('/me/fast')) {
        if (authHeader === 'Bearer jwt-1') return json({ error: 'Expired' }, 401)
        if (authHeader === 'Bearer jwt-2') return json({ fast: true })
      }
      return json({}, 404)
    })

    const slowPromise = session.authedFetch<{ success: boolean }>('/me/slow')
    let fastResult: { fast: boolean } | undefined
    await act(async () => {
      fastResult = await session.authedFetch<{ fast: boolean }>('/me/fast')
    })
    expect(fastResult).toEqual({ fast: true })
    expect(refreshCalls).toBe(1)

    let slowResult: { success: boolean } | undefined
    await act(async () => {
      requestADeferred.resolve(json({ error: 'Expired' }, 401))
      slowResult = await slowPromise
    })

    expect(slowResult).toEqual({ success: true })
    expect(refreshCalls).toBe(1)
  })

  it('does not sign out if retry fails after a successful refresh', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-1', expiresIn: 900 }) : json({}, 404),
    )

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    let refreshCalls = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++
        return json({ token: 'jwt-2', expiresIn: 900 })
      }
      if (url.endsWith('/me/broken-endpoint')) {
        return json({ error: 'Forbidden' }, 401)
      }
      return json({}, 404)
    })

    await act(async () => {
      await expect(session.authedFetch('/me/broken-endpoint')).rejects.toThrow('HTTP 401')
    })

    expect(refreshCalls).toBe(1)
    expect(session.isAuthenticated).toBe(true)
    expect(session.status).toBe('authenticated')
  })

  it('does not resurrect a cleared session if user signs out while refresh is in flight', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-1', expiresIn: 900 }) : json({}, 404),
    )

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    const refreshDeferred = defer<Response>()
    let refreshStarted = false
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshStarted = true
        return refreshDeferred.promise
      }
      if (url.endsWith('/auth/logout')) {
        return json({})
      }
      if (url.endsWith('/me/data')) {
        return json({ error: 'Expired' }, 401)
      }
      return json({}, 404)
    })

    const fetchPromise = session.authedFetch('/me/data')

    // Wait until /auth/refresh is actively in flight before signing out
    await waitFor(() => expect(refreshStarted).toBe(true))

    await act(async () => {
      await session.signOut()
    })
    expect(session.isAuthenticated).toBe(false)

    await act(async () => {
      refreshDeferred.resolve(json({ token: 'jwt-late', expiresIn: 900 }))
      await expect(fetchPromise).rejects.toThrow()
    })

    expect(session.isAuthenticated).toBe(false)
    expect(session.status).toBe('signed-out')
    expect(session.address).toBeNull()
  })

  it('refreshes session on visibility change when tab becomes visible and token is expiring', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? json({ token: 'jwt-1', expiresAt: Date.now() + 30_000 })
        : json({}, 404),
    )

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    let refreshCalled = false
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalled = true
        return json({ token: 'jwt-refreshed', expiresIn: 900 })
      }
      return json({}, 404)
    })

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(refreshCalled).toBe(true))
    expect(session.isAuthenticated).toBe(true)
  })
  /**
   * The token is bound to one address. Switching wallets or disconnecting must
   * drop it; validity is derived rather than cleared in an effect (#598), so
   * these pin that the derivation is correct, not merely faster.
   */
  it('stops reporting an authenticated session when the wallet disconnects', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-3', expiresIn: 900 }) : json({}, 404),
    )
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    act(() => walletMock.setAddress(null))

    await waitFor(() => expect(session.isAuthenticated).toBe(false))
    expect(session.address).toBeNull()
  })

  it('stops reporting an authenticated session when the address changes', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json({ token: 'jwt-4', expiresIn: 900 }) : json({}, 404),
    )
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    act(() => walletMock.setAddress('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'))

    await waitFor(() => expect(session.isAuthenticated).toBe(false))
  })

  it('refuses to call an endpoint once the session is invalidated', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return json({ token: 'jwt-5', expiresIn: 900 })
      if (url.endsWith('/me/watchlist')) return json([7])
      return json({}, 404)
    })
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(session.isAuthenticated).toBe(true))

    const data = await act(() => session.authedFetch<number[]>('/me/watchlist'))
    expect(data).toEqual([7])

    act(() => walletMock.setAddress(null))
    await waitFor(() => expect(session.isAuthenticated).toBe(false))

    await expect(act(() => session.authedFetch<number[]>('/me/watchlist'))).rejects.toThrow(
      'Not signed in',
    )
  })
})
