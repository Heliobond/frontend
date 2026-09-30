import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthError,
  endSession,
  refreshSession,
  requestChallenge,
  verifyChallenge,
} from './sessionClient'

describe('session client recovery boundaries (#723)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', 'https://auth.example.test')
    vi.stubGlobal('fetch', vi.fn())
  })

  it('requests and verifies a message challenge', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ challenge: 'sign-me', type: 'message' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'session', expiresIn: 60 }), { status: 200 }),
      )

    const challenge = await requestChallenge('GABC')
    const session = await verifyChallenge('GABC', challenge, 'signature')

    expect(challenge.challenge).toBe('sign-me')
    expect(session.token).toBe('session')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('preserves HTTP status for failed refresh and makes logout best effort', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(refreshSession()).rejects.toEqual(new AuthError('HTTP 401', 401))

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await expect(endSession(null)).resolves.toBeUndefined()
  })
})
