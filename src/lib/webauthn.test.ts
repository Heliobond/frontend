import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loginBiometric, registerBiometric } from './webauthn'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const buffer = () => new Uint8Array([1, 2, 3]).buffer
const assertion = () => ({
  id: 'credential',
  rawId: buffer(),
  type: 'public-key',
  response: {
    authenticatorData: buffer(),
    clientDataJSON: buffer(),
    signature: buffer(),
    userHandle: null,
  },
})
const get = vi.fn()
const create = vi.fn()
beforeEach(() => {
  get.mockReset().mockResolvedValue(assertion())
  create.mockReset().mockResolvedValue({
    ...assertion(),
    response: { attestationObject: buffer(), clientDataJSON: buffer() },
  })
  vi.stubGlobal('PublicKeyCredential', function () {})
  vi.stubGlobal('navigator', { credentials: { get, create } })
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        json({ challenge: 'AQID', allowCredentials: [{ id: 'AQID', type: 'public-key' }] }),
      ),
  )
})
afterEach(() => vi.unstubAllGlobals())

it('serializes the assertion and accepts only explicit server verification', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(json({ verified: true }))
  await expect(loginBiometric('person@example.com')).resolves.toEqual({ verified: true })
  expect(get).toHaveBeenCalledWith({
    publicKey: expect.objectContaining({
      challenge: buffer(),
      allowCredentials: [{ id: buffer(), type: 'public-key' }],
    }),
  })
  const [, init] = vi.mocked(fetch).mock.calls[1]
  expect(JSON.parse(init!.body as string)).toEqual({
    username: 'person@example.com',
    credential: {
      id: 'credential',
      rawId: 'AQID',
      type: 'public-key',
      response: {
        authenticatorData: 'AQID',
        clientDataJSON: 'AQID',
        signature: 'AQID',
        userHandle: null,
      },
    },
  })
  expect(init).toMatchObject({ credentials: 'same-origin', cache: 'no-store' })
})
it.each([{ verified: false }, { status: 'ok' }, {}, null, { verified: 'true' }])(
  'rejects an unverified HTTP 200 response: %j',
  async (body) => {
    vi.mocked(fetch).mockResolvedValueOnce(json(body))
    await expect(loginBiometric('person@example.com')).rejects.toThrow('Server did not verify')
    expect(get).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
  },
)
it('rejects a server verification failure after the browser returns a credential', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(json({ error: 'Invalid assertion' }, 401))
  await expect(loginBiometric('person@example.com')).rejects.toThrow('Invalid assertion')
  expect(get).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('does not submit an assertion after cancellation', async () => {
  get.mockResolvedValue(null)
  await expect(loginBiometric('person@example.com')).rejects.toThrow('Authentication canceled')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('does not prompt if challenge issuance fails', async () => {
  vi.mocked(fetch)
    .mockReset()
    .mockResolvedValue(json({ error: 'No challenge' }, 503))
  await expect(loginBiometric('person@example.com')).rejects.toThrow('No challenge')
  expect(get).not.toHaveBeenCalled()
})
it('requires a username instead of falling back to a shared user identity', async () => {
  await expect(loginBiometric('')).rejects.toThrow('Username is required')
  expect(fetch).not.toHaveBeenCalled()
})
it('also requires verification for registration', async () => {
  vi.mocked(fetch)
    .mockReset()
    .mockResolvedValueOnce(
      json({
        challenge: 'AQID',
        user: { id: 'AQID', name: 'person', displayName: 'Person' },
        rp: { name: 'Heliobond' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      }),
    )
    .mockResolvedValueOnce(json({ verified: false }))
  await expect(registerBiometric('person@example.com')).rejects.toThrow('Server did not verify')
  expect(create).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledTimes(2)
})
