'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

export interface RemoteSyncStatus {
  /** True once the server copy has been pulled and merged for this session. */
  hydrated: boolean
  /** True when the initial pull gave up after all retries. */
  syncFailed: boolean
}

const PUSH_DEBOUNCE_MS = 500
/** Backoff between attempts at the initial pull (#831). */
const PULL_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]

const unavailable = async <R>(): Promise<R> => {
  throw new Error('No session')
}

const jsonEqual = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Keeps a piece of local state in sync with `/me/<resource>` once the wallet
 * session is authenticated (#603). On sign-in it pulls the server copy, merges it
 * with the local one (so nothing saved while signed out is lost) and pushes the
 * result; afterwards local changes are pushed, debounced. Signed out, the state
 * stays local-only — exactly the previous behaviour. Storage remains the offline
 * cache, the server is the source of truth across devices.
 *
 * The initial pull is retried with backoff, so one transient failure no longer
 * disables sync for the session (#831). All writes go through one queue, so
 * PUTs land in the order they were made and the last edit wins on the server.
 */
export function useRemoteSync<T>({
  resource,
  value,
  apply,
  merge,
  isEqual = jsonEqual,
}: RemoteSyncOptions<T>): RemoteSyncStatus {
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
  // Tail of the write queue. Each PUT waits for the one before it.
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  // Outcome of the last initial pull, tagged with the session it belongs to. Stale
  // outcomes from a previous address are ignored, so no reset is needed on sign-out.
  const sessionKey = isAuthenticated && address ? `${address}:${path}` : null
  const [pull, setPull] = useState<{ key: string; ok: boolean } | null>(null)
  const hydrated = sessionKey !== null && pull?.key === sessionKey && pull.ok
  const syncFailed = sessionKey !== null && pull?.key === sessionKey && !pull.ok

  const enqueuePut = useCallback(
    (body: T) => {
      const write = writeQueue.current.then(async () => {
        await authedFetch(path, { method: 'PUT', body })
        remoteValue.current = body
      })
      writeQueue.current = write.catch(() => undefined)
      return write
    },
    [authedFetch, path],
  )

  // Initial pull + merge, once per authenticated address.
  useEffect(() => {
    remoteValue.current = null
    if (sessionKey === null) return
    const key = sessionKey
    let cancelled = false

    const fetchRemote = async (): Promise<T | null> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await authedFetch<T>(path)
        } catch {
          if (attempt >= PULL_RETRY_DELAYS_MS.length) return null
          await delay(PULL_RETRY_DELAYS_MS[attempt])
          if (cancelled) return null
        }
      }
    }

    void (async () => {
      const remote = await fetchRemote()
      if (cancelled) return
      if (remote === null) {
        setPull({ key, ok: false })
        return
      }
      const merged = mergeRef.current(valueRef.current, remote)
      remoteValue.current = remote
      if (!equalRef.current(merged, valueRef.current)) applyRef.current(merged)
      setPull({ key, ok: true })
      if (!equalRef.current(merged, remote)) {
        try {
          await enqueuePut(merged)
        } catch {
          /* server unreachable — the next local change pushes again */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, address, authedFetch, path, enqueuePut, sessionKey])

  // Push later local changes once the server copy is known.
  useEffect(() => {
    if (!isAuthenticated || !hydrated) return
    if (remoteValue.current !== null && equalRef.current(value, remoteValue.current)) return
    const timer = setTimeout(() => {
      enqueuePut(valueRef.current).catch(() => {
        /* retried on the next change / next sign-in merge */
      })
    }, PUSH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, isAuthenticated, hydrated, enqueuePut])

  return { hydrated, syncFailed }
}
