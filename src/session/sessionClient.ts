// Wallet-based sign-in client (#603). Talks to the backend's challenge/verify
// endpoints (see docs/AUTH.md for the contract) and exchanges a wallet signature
// for a short-lived JWT bound to the G-address. The token is held in memory by
// SessionProvider — never in localStorage.

export type ChallengeType = 'message' | 'transaction'

export interface Challenge {
  /** SEP-53 message to sign, or a SEP-10 challenge transaction XDR. */
  challenge: string
  type: ChallengeType
  /** Network passphrase to sign a `transaction` challenge with. */
  networkPassphrase?: string
}

export interface SessionToken {
  token: string
  /** Epoch milliseconds when the token stops being valid. */
  expiresAt: number
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

/** Base URL of the auth endpoints. Unset means the backend isn't configured. */
export function authBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXT_PUBLIC_API_URL
  return url ? url.replace(/\/+$/, '') : null
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  token?: string
  signal?: AbortSignal
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const base = authBaseUrl()
  if (!base) throw new AuthError('Backend is not configured')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    // The refresh cookie (HttpOnly, set by the backend) rides along on auth calls.
    credentials: 'include',
    signal: opts.signal,
  })
  if (!res.ok) throw new AuthError(`HTTP ${res.status}`, res.status)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function toSessionToken(payload: {
  token?: unknown
  expiresIn?: unknown
  expiresAt?: unknown
}): SessionToken {
  if (typeof payload.token !== 'string' || !payload.token) {
    throw new AuthError('Malformed session response')
  }
  let expiresAt: number
  if (typeof payload.expiresIn === 'number') expiresAt = Date.now() + payload.expiresIn * 1000
  else if (typeof payload.expiresAt === 'number') expiresAt = payload.expiresAt
  else throw new AuthError('Malformed session response')
  return { token: payload.token, expiresAt }
}

export function requestChallenge(address: string, signal?: AbortSignal): Promise<Challenge> {
  return request<Challenge>('/auth/challenge', { body: { address }, signal })
}

/** `signature` is the signed message (SEP-53) or the signed challenge XDR (SEP-10). */
export async function verifyChallenge(
  address: string,
  challenge: Challenge,
  signature: string,
  signal?: AbortSignal,
): Promise<SessionToken> {
  const payload = await request<{ token?: unknown; expiresIn?: unknown; expiresAt?: unknown }>(
    '/auth/verify',
    {
      body: {
        address,
        type: challenge.type,
        challenge: challenge.challenge,
        signature,
      },
      signal,
    },
  )
  return toSessionToken(payload)
}

/** Silent refresh through the HttpOnly refresh cookie. Rejects when there is none. */
export async function refreshSession(signal?: AbortSignal): Promise<SessionToken> {
  const payload = await request<{ token?: unknown; expiresIn?: unknown; expiresAt?: unknown }>(
    '/auth/refresh',
    { method: 'POST', body: {}, signal },
  )
  return toSessionToken(payload)
}

export async function endSession(token: string | null): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST', body: {}, token: token ?? undefined })
  } catch {
    /* best effort — the in-memory token is dropped either way */
  }
}

/** Authenticated JSON call for the /me/* endpoints. */
export function authedRequest<T>(
  path: string,
  token: string,
  opts: Omit<RequestOptions, 'token'> = {},
): Promise<T> {
  return request<T>(path, { ...opts, token })
}
