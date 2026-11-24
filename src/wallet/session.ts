/**
 * Persisted wallet session: the connected address, the wallet module that
 * produced it, and the selected network.
 *
 * Kept outside React and exposed through `useSyncExternalStore` so the provider
 * never has to copy localStorage into state from an effect (#598). The parsed
 * snapshot is cached and only recomputed when this module writes or another tab
 * changes the value, which keeps `getSnapshot` referentially stable — React
 * re-renders forever if it is not.
 */
import { RECURRING_STORAGE_KEY } from '../lib/recurringInvestments'
import { WATCHLIST_STORAGE_KEY } from '../lib/watchlist'
import { YIELD_ALERTS_STORAGE_KEY } from '../lib/yieldAlerts'
import { PENDING_CLAIMS_STORAGE_KEY } from './pendingClaims'

export const ADDRESS_KEY = 'hb-address'
export const WALLET_KEY = 'hb-wallet'
export const NETWORK_KEY = 'hb-network'
const USER_DATA_KEYS = [
  PENDING_CLAIMS_STORAGE_KEY,
  RECURRING_STORAGE_KEY,
  YIELD_ALERTS_STORAGE_KEY,
  WATCHLIST_STORAGE_KEY,
] as const

export type AppNetwork = 'PUBLIC' | 'TESTNET'

/** The demo wallet id marks a session created by `connectDemo()` rather than a real wallet. */
export const DEMO_WALLET_ID = 'demo'

export interface StoredSession {
  address: string
  walletId: string | null
  network: AppNetwork | null
}

/**
 * Snapshot used on the server and for the first client render, before storage
 * has been read. Identity is meaningful: it tells callers the session is not
 * known yet, which is what keeps `RequireWallet` from redirecting a connected
 * user on every page load.
 */
export const UNREAD_SESSION: StoredSession = { address: '', walletId: null, network: null }

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // Access itself throws when the browser blocks storage (private mode, sandboxed iframe).
    return null
  }
}

function parseNetwork(raw: string | null): AppNetwork | null {
  return raw === 'PUBLIC' || raw === 'TESTNET' ? raw : null
}

function readStorage(): StoredSession | null {
  const store = storage()
  if (!store) return null
  try {
    return {
      address: store.getItem(ADDRESS_KEY) ?? '',
      walletId: store.getItem(WALLET_KEY),
      network: parseNetwork(store.getItem(NETWORK_KEY)),
    }
  } catch {
    return null
  }
}

// Failed local writes or removals take precedence over stale or partial storage for this visit.
let memorySession: Pick<StoredSession, 'address' | 'walletId'> | null = null

/** Returns a fresh snapshot, even when storage is unavailable. */
export function readSession(): StoredSession {
  const stored = readStorage()
  return {
    ...(stored ?? UNREAD_SESSION),
    ...memorySession,
    network: stored ? stored.network : snapshot.network,
  }
}

/** No session on the server: the first client render must match the server HTML. */
export function getServerSession(): StoredSession {
  return UNREAD_SESSION
}

let snapshot: StoredSession = UNREAD_SESSION
const listeners = new Set<() => void>()

function refresh(): void {
  snapshot = readSession()
}

export function subscribeSession(listener: () => void): () => void {
  if (!listeners.size) refresh()
  listeners.add(listener)
  if (typeof window !== 'undefined') {
    // Another tab connecting or disconnecting must reach this one too.
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== ADDRESS_KEY &&
        event.key !== WALLET_KEY &&
        event.key !== NETWORK_KEY
      )
        return
      refresh()
      listener()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  }
  return () => {
    listeners.delete(listener)
  }
}

export function getSession(): StoredSession {
  return snapshot
}

function publish(): void {
  refresh()
  listeners.forEach((listener) => listener())
}

/**
 * Stores a connected session. `demo` sessions are flagged so the UI can hide
 * wallet actions that cannot be signed for.
 */
export function saveSession(address: string, walletId: string): void {
  const requested = { address, walletId }
  const store = storage()
  const previous = readStorage()
  memorySession = requested
  if (store && previous) {
    try {
      store.setItem(ADDRESS_KEY, address)
      try {
        store.setItem(WALLET_KEY, walletId)
        memorySession = null
      } catch {
        // Restore the previous address so a reload cannot pair the new address with the old wallet.
        if (previous.address) store.setItem(ADDRESS_KEY, previous.address)
        else store.removeItem(ADDRESS_KEY)
      }
    } catch {
      /* Storage may deny both writing and rollback. Use the in-memory session. */
    }
  }
  publish()
}

export function clearSession(): void {
  const store = storage()
  for (const key of [ADDRESS_KEY, WALLET_KEY]) {
    try {
      store?.removeItem(key)
    } catch {
      /* Storage may still contain a stale session. */
    }
  }
  const stored = readStorage()
  memorySession = stored?.address === '' && stored.walletId === null ? null : UNREAD_SESSION
  clearUserData()
  publish()
}

/** Removes data scoped to the disconnected wallet without changing preferences. */
export function clearUserData(): void {
  const store = storage()
  if (!store) return
  for (const key of USER_DATA_KEYS) {
    try {
      store.removeItem(key)
      window.dispatchEvent(new StorageEvent('storage', { key }))
    } catch {
      /* Storage may be unavailable or disabled. */
    }
  }
}

export function saveNetwork(network: AppNetwork): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(NETWORK_KEY, network)
  } catch {
    /* ignore */
  }
  publish()
}
