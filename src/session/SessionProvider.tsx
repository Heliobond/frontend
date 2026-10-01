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
  // Addresses the user already declined/failed to sign for, so we don't nag.
  const attempted = useRef<Set<string>>(new Set())

  const addressRef = useRef(address)
  const isMountedRef = useRef(true)

  useEffect(() => {
    addressRef.current = address
  }, [address])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Epoch counter to detect if the session was cleared or signed out while a refresh was in flight.
  const sessionEpochRef = useRef(0)
  // Single in-flight refresh promise shared by timer, authedFetch, and connect-time restore.
  const refreshPromiseRef = useRef<Promise<SessionToken> | null>(null)

  /**
   * The token, but only while it still matches the connected wallet.
   *
   * Derived rather than cleared in an effect: when the address changes or the
   * wallet disconnects the stored token stops being usable immediately, and
   * nothing renders an authenticated session in the meantime (#598).
   */
  const activeSession = session && eligible && session.address === address ? session : null

  // Read by the callbacks below, which must not be re-created per token.
  // Every write already updates it; this only catches a token invalidated by a
  // wallet change.
  const sessionRef = useRef<(SessionToken & { address: string }) | null>(null)
  useEffect(() => {
    sessionRef.current = activeSession
  }, [activeSession])

  const clear = useCallback(() => {
    sessionEpochRef.current += 1
    sessionRef.current = null
    setSession(null)
  }, [])

  const refreshCurrentSession = useCallback(async (): Promise<SessionToken> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }

    const epoch = sessionEpochRef.current
    const targetAddress = addressRef.current ?? sessionRef.current?.address ?? null

    const promise = (async () => {
      try {
        const token = await refreshSession()
        // If the session was cleared or the address changed while in flight,
        // do not resurrect the cleared session.
        if (
          sessionEpochRef.current !== epoch ||
          !isMountedRef.current ||
          !targetAddress ||
          addressRef.current !== targetAddress
        ) {
          return token
        }
        const next = { ...token, address: targetAddress }
        sessionRef.current = next
        setSession(next)
        return token
      } catch (err) {
        if (sessionEpochRef.current === epoch && isMountedRef.current) {
          clear()
        }
        throw err
      } finally {
        refreshPromiseRef.current = null
      }
    })()

    refreshPromiseRef.current = promise
    return promise
  }, [clear])

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
      sessionEpochRef.current += 1
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

  // Address changed or wallet disconnected: handled by `activeSession` above,
  // so the stale token stops being usable without an extra render pass (#598).

  // On connect: restore silently via the refresh cookie, else ask for a signature once.
  useEffect(() => {
    if (!eligible || !address || sessionRef.current) return
    if (attempted.current.has(address)) return
    attempted.current.add(address)
    let cancelled = false
    void (async () => {
      try {
        await refreshCurrentSession()
      } catch {
        if (!cancelled && isMountedRef.current && !sessionRef.current) {
          await signIn()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eligible, address, signIn, refreshCurrentSession])

  // Silent refresh shortly before expiry, with jitter and pause-while-hidden.
  useEffect(() => {
    // Keyed on the derived session so an invalidated token stops being refreshed.
    if (!activeSession) return

    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleTimer = () => {
      // Small jitter (0-5s) to avoid synchronised refreshes across tabs.
      const jitter = Math.floor(Math.random() * 5_000)
      const delay = Math.max(activeSession.expiresAt - Date.now() - REFRESH_LEAD_MS - jitter, 5_000)

      timer = setTimeout(async () => {
        if (typeof document !== 'undefined' && document.hidden) {
          // Tab is hidden; pause timer refresh. It will refresh when the tab becomes visible.
          return
        }
        try {
          await refreshCurrentSession()
        } catch {
          // Failure handled inside refreshCurrentSession (clear called)
        }
      }, delay)
    }

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        const timeUntilExpiry = activeSession.expiresAt - Date.now()
        if (timeUntilExpiry <= REFRESH_LEAD_MS) {
          void refreshCurrentSession().catch(() => {})
        }
      }
    }

    scheduleTimer()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      if (timer) clearTimeout(timer)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  }, [activeSession, refreshCurrentSession])

  const authedFetch = useCallback<SessionContextValue['authedFetch']>(
    async (path, init) => {
      const initial = sessionRef.current
      if (!initial) throw new AuthError('Not signed in', 401)
      try {
        return await authedRequest(path, initial.token, init)
      } catch (e) {
        if (!(e instanceof AuthError) || e.status !== 401) throw e

        // If the session was cleared while the request was in flight (e.g. user signed out or wallet disconnected),
        // do not refresh or retry; throw 401 immediately.
        if (!sessionRef.current) {
          throw new AuthError('Not signed in', 401)
        }

        let tokenToUse: string
        const current = sessionRef.current
        // If the token changed while the request was in flight (i.e. another caller already refreshed),
        // retry once with the new token instead of triggering another refresh.
        if (current && current.token !== initial.token) {
          tokenToUse = current.token
        } else {
          const refreshed = await refreshCurrentSession()
          tokenToUse = refreshed.token
        }

        if (!sessionRef.current) {
          throw new AuthError('Not signed in', 401)
        }

        // Retry once with the refreshed/new token.
        // A failed retry after a successful refresh must NOT sign the user out.
        return await authedRequest(path, tokenToUse, init)
      }
    },
    [refreshCurrentSession],
  )

  const status: SessionStatus = !configured
    ? 'unavailable'
    : activeSession
      ? 'authenticated'
      : signingIn
        ? 'signing-in'
        : 'signed-out'

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      address: activeSession?.address ?? null,
      isAuthenticated: status === 'authenticated',
      error,
      signIn,
      signOut,
      authedFetch,
    }),
    [status, activeSession?.address, error, signIn, signOut, authedFetch],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
