'use client'

import { useEffect, useRef } from 'react'
import { useOptionalSession } from './SessionProvider'

interface RemoteSyncOptions<T> {
  /** Endpoint segment under /me, e.g. "watchlist" → GET/PUT /me/watchlist. */
  resource: string
  /** Current local value. */
  value: T
  /** Replace the local value (and persist it locally). */
  apply: (next: T) => void
  /** Combine the local and server copies on first load after sign-in. */
  merge: (local: T, remote: T) => T
  isEqual?: (a: T, b: T) => boolean
}

const PUSH_DEBOUNCE_MS = 500

const unavailable = async <R>(): Promise<R> => {
  throw new Error('No session')
}

const jsonEqual = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Keeps a piece of local state in sync with `/me/<resource>` once the wallet
 * session is authenticated (#603). On sign-in it pulls the server copy, merges it
 * with the local one (so nothing saved while signed out is lost) and pushes the
 * result; afterwards local changes are pushed, debounced. Signed out, the state
 * stays local-only — exactly the previous behaviour. Storage remains the offline
 * cache, the server is the source of truth across devices.
 */
export function useRemoteSync<T>({
  resource,
  value,
  apply,
  merge,
  isEqual = jsonEqual,
}: RemoteSyncOptions<T>) {
  const session = useOptionalSession()
  const isAuthenticated = session?.isAuthenticated ?? false
  const address = session?.address ?? null
  const authedFetch = session?.authedFetch ?? unavailable
  const path = `/me/${resource}`

  // Callers pass fresh closures every render. The effects below must not
  // re-subscribe when only those identities change, so they read the latest
  // value through refs. Synced after commit, never written during render.
  const valueRef = useRef(value)
  const applyRef = useRef(apply)
  const mergeRef = useRef(merge)
  const equalRef = useRef(isEqual)

  useEffect(() => {
    valueRef.current = value
    applyRef.current = apply
    mergeRef.current = merge
    equalRef.current = isEqual
  })

  // What the server is known to hold; null until the initial pull for this session.
  const remoteValue = useRef<T | null>(null)
  const hydrated = useRef(false)

  // Initial pull + merge, once per authenticated address.
  useEffect(() => {
    hydrated.current = false
    remoteValue.current = null
    if (!isAuthenticated || !address) return
    let cancelled = false
    void (async () => {
      try {
        const remote = await authedFetch<T>(path)
        if (cancelled) return
        const merged = mergeRef.current(valueRef.current, remote)
        remoteValue.current = remote
        hydrated.current = true
        if (!equalRef.current(merged, valueRef.current)) applyRef.current(merged)
        if (!equalRef.current(merged, remote)) {
          await authedFetch(path, { method: 'PUT', body: merged })
          remoteValue.current = merged
        }
      } catch {
        /* server unreachable — keep working from local state */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, address, authedFetch, path])

  // Push later local changes.
  useEffect(() => {
    if (!isAuthenticated || !hydrated.current) return
    if (remoteValue.current !== null && equalRef.current(value, remoteValue.current)) return
    const timer = setTimeout(async () => {
      const next = valueRef.current
      try {
        await authedFetch(path, { method: 'PUT', body: next })
        remoteValue.current = next
      } catch {
        /* retried on the next change / next sign-in merge */
      }
    }, PUSH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, isAuthenticated, authedFetch, path])
}
