'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useWallet } from '../wallet/WalletProvider'
import {
  AuthError,
  authBaseUrl,
  authedRequest,
  endSession,
  refreshSession,
  requestChallenge,
  verifyChallenge,
  type SessionToken,
} from './sessionClient'

export type SessionStatus = 'unavailable' | 'signed-out' | 'signing-in' | 'authenticated'

export interface SessionContextValue {
  status: SessionStatus
  /** The G-address the session is bound to, when authenticated. */
  address: string | null
  isAuthenticated: boolean
  error: string | null
  /** Run challenge → wallet signature → token exchange. */
  signIn: () => Promise<boolean>
  signOut: () => Promise<void>
  /** Call an authenticated endpoint; refreshes once on a 401. */
  authedFetch: <T>(
    path: string,
    init?: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown },
  ) => Promise<T>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>')
  return ctx
}

/** Like useSession, but null outside a <SessionProvider> (e.g. isolated component tests). */
export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext)
}

/** Refresh this long before the token expires. */
const REFRESH_LEAD_MS = 60_000

/**
 * Wallet-signature session (#603). The token lives in this component's memory only;
 * a page reload restores it through the backend's HttpOnly refresh cookie, and a
 * wallet change/disconnect drops it. Demo wallets never sign in.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isDemo, signMessage, sign } = useWallet()
  const configured = authBaseUrl() !== null
  const eligible = configured && address !== null && !isDemo

  const [session, setSession] = useState<(SessionToken & { address: string }) | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session
  // Addresses the user already declined/failed to sign for, so we don't nag.
  const attempted = useRef<Set<string>>(new Set())

  const clear = useCallback(() => {
    sessionRef.current = null
    setSession(null)
  }, [])

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!eligible || !address) return false
    setSigningIn(true)
    setError(null)
    try {
      const challenge = await requestChallenge(address)
      let signature: string
      if (challenge.type === 'transaction') {
        signature = await sign(challenge.challenge, challenge.networkPassphrase)
      } else {
        signature = await signMessage(challenge.challenge)
      }
      const token = await verifyChallenge(address, challenge, signature)
      const next = { ...token, address }
      sessionRef.current = next
      setSession(next)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
      return false
    } finally {
      setSigningIn(false)
    }
  }, [eligible, address, sign, signMessage])

  const signOut = useCallback(async () => {
    const token = sessionRef.current?.token ?? null
    clear()
    await endSession(token)
  }, [clear])

  // Address changed or wallet disconnected: the old token no longer matches.
  useEffect(() => {
    if (session && (!eligible || session.address !== address)) clear()
  }, [session, eligible, address, clear])

  // On connect: restore silently via the refresh cookie, else ask for a signature once.
  useEffect(() => {
    if (!eligible || !address || sessionRef.current) return
    if (attempted.current.has(address)) return
    attempted.current.add(address)
    const controller = new AbortController()
    void (async () => {
      try {
        const token = await refreshSession(controller.signal)
        const next = { ...token, address }
        sessionRef.current = next
        setSession(next)
      } catch {
        if (!controller.signal.aborted) await signIn()
      }
    })()
    return () => controller.abort()
  }, [eligible, address, signIn])

  // Silent refresh shortly before expiry.
  useEffect(() => {
    if (!session) return
    const delay = Math.max(session.expiresAt - Date.now() - REFRESH_LEAD_MS, 5_000)
    const timer = setTimeout(async () => {
      try {
        const token = await refreshSession()
        const next = { ...token, address: session.address }
        sessionRef.current = next
        setSession(next)
      } catch {
        clear()
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [session, clear])

  const authedFetch = useCallback<SessionContextValue['authedFetch']>(
    async (path, init) => {
      const current = sessionRef.current
      if (!current) throw new AuthError('Not signed in', 401)
      try {
        return await authedRequest(path, current.token, init)
      } catch (e) {
        if (!(e instanceof AuthError) || e.status !== 401) throw e
        try {
          const token = await refreshSession()
          const next = { ...token, address: current.address }
          sessionRef.current = next
          setSession(next)
          return await authedRequest(path, token.token, init)
        } catch (retryError) {
          clear()
          throw retryError
        }
      }
    },
    [clear],
  )

  const status: SessionStatus = !configured
    ? 'unavailable'
    : session
      ? 'authenticated'
      : signingIn
        ? 'signing-in'
        : 'signed-out'

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      address: session?.address ?? null,
      isAuthenticated: status === 'authenticated',
      error,
      signIn,
      signOut,
      authedFetch,
    }),
    [status, session?.address, error, signIn, signOut, authedFetch],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
