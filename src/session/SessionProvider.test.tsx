import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const wallet = {
  address: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
  isDemo: false,
  signMessage: vi.fn(async () => 'signed-message'),
  sign: vi.fn(async () => 'signed-xdr'),
}

vi.mock('../wallet/WalletProvider', () => ({ useWallet: () => wallet }))

import { SessionProvider, useSession, type SessionContextValue } from './SessionProvider'

let session: SessionContextValue
function Probe() {
  session = useSession()
  return null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe('SessionProvider', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    wallet.signMessage.mockClear()
  })
  afterEach(() => {
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
    expect(wallet.signMessage).toHaveBeenCalledWith('hello G...')
    const verifyBody = JSON.parse(
      fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/verify'))![1].body,
    )
    expect(verifyBody).toMatchObject({ address: wallet.address, signature: 'signed-message' })

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
    expect(wallet.signMessage).not.toHaveBeenCalled()
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
})
