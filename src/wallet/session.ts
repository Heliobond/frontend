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

export const ADDRESS_KEY = 'hb-address'
export const WALLET_KEY = 'hb-wallet'
export const NETWORK_KEY = 'hb-network'

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

/**
 * Reads storage. Always returns a fresh object, so a caller can tell "read, and
 * there is no session" apart from "not read yet".
 */
export function readSession(): StoredSession {
  const store = storage()
  if (!store) return { ...UNREAD_SESSION }
  try {
    return {
      address: store.getItem(ADDRESS_KEY) ?? '',
      walletId: store.getItem(WALLET_KEY),
      network: parseNetwork(store.getItem(NETWORK_KEY)),
    }
  } catch {
    return { ...UNREAD_SESSION }
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
    window.addEventListener('storage', listener)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', listener)
    }
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
  const store = storage()
  if (!store) return
  try {
    store.setItem(ADDRESS_KEY, address)
    store.setItem(WALLET_KEY, walletId)
  } catch {
    /* Storage may be full or disabled; the session still works for this tab. */
  }
  publish()
}

export function clearSession(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(ADDRESS_KEY)
    store.removeItem(WALLET_KEY)
  } catch {
    /* ignore */
  }
  publish()
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
