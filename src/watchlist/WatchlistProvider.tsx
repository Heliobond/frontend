'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { readWatchlist, writeWatchlist, WATCHLIST_STORAGE_KEY } from '../lib/watchlist'
import { useRemoteSync } from '../session/useRemoteSync'

interface WatchlistContextValue {
  /** Saved bond ids, most-recently-added last. */
  ids: number[]
  /** How many bonds are on the watchlist. */
  count: number
  has: (id: number) => boolean
  add: (id: number) => void
  remove: (id: number) => void
  /** Add the bond if absent, remove it if present. Returns the new saved state. */
  toggle: (id: number) => boolean
  clear: () => void
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null)

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext)
  if (!ctx) throw new Error('useWatchlist must be used within <WatchlistProvider>')
  return ctx
}

/**
 * Holds the bond watchlist (issue #407) and mirrors it to localStorage. Starts
 * empty on the server and first client render to avoid a hydration mismatch,
 * then hydrates from storage on mount. Reacts to `storage` events so a change
 * in one tab shows up in the others.
 */
export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(readWatchlist())

    const syncOtherTabs = (event: StorageEvent) => {
      if (event.key !== WATCHLIST_STORAGE_KEY) return
      setIds(readWatchlist())
    }
    window.addEventListener('storage', syncOtherTabs)
    return () => window.removeEventListener('storage', syncOtherTabs)
  }, [])

  const commit = useCallback((next: number[]) => {
    setIds(next)
    writeWatchlist(next)
  }, [])

  // Sync across devices once the wallet session is signed in (#603).
  useRemoteSync<number[]>({
    resource: 'watchlist',
    value: ids,
    apply: commit,
    merge: (local, remote) => [...new Set([...(Array.isArray(remote) ? remote : []), ...local])],
  })

  const has = useCallback((id: number) => ids.includes(id), [ids])

  const add = useCallback(
    (id: number) => {
      if (ids.includes(id)) return
      commit([...ids, id])
    },
    [ids, commit],
  )

  const remove = useCallback(
    (id: number) => {
      if (!ids.includes(id)) return
      commit(ids.filter((x) => x !== id))
    },
    [ids, commit],
  )

  const toggle = useCallback(
    (id: number) => {
      if (ids.includes(id)) {
        commit(ids.filter((x) => x !== id))
        return false
      }
      commit([...ids, id])
      return true
    },
    [ids, commit],
  )

  const clear = useCallback(() => commit([]), [commit])

  return (
    <WatchlistContext.Provider value={{ ids, count: ids.length, has, add, remove, toggle, clear }}>
      {children}
    </WatchlistContext.Provider>
  )
}
