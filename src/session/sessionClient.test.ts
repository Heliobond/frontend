import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthError,
  endSession,
  refreshSession,
  requestChallenge,
  tokenAddress,
  verifyChallenge,
} from './sessionClient'

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

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

  it('reads the address claim from a JWT', () => {
    const address = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
    expect(tokenAddress(fakeJwt({ sub: address }))).toBe(address)
    expect(tokenAddress(fakeJwt({ address }))).toBe(address)
    expect(tokenAddress('opaque-token')).toBeNull()
  })

  it('binds the refresh response to the address it carries', async () => {
    const address = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: fakeJwt({ sub: address }), expiresIn: 60 }), {
        status: 200,
      }),
    )

    const session = await refreshSession()
    expect(session.address).toBe(address)
  })

  it('prefers an explicit address over the token payload', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: fakeJwt({ sub: 'GDECOY' }),
          expiresIn: 60,
          address: 'GEXPLICIT',
        }),
        { status: 200 },
      ),
    )

    const session = await refreshSession()
    expect(session.address).toBe('GEXPLICIT')
  })
})
