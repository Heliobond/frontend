/**
 * Storage and management of queued withdrawal claims.
 * Persists pending claims across page reloads in window.localStorage.
 */

export interface PendingClaim {
  id: string
  hash: string
  amount?: number
  timestamp: number
  address?: string
}

export const PENDING_CLAIMS_STORAGE_KEY = 'hb-pending-claims'
const STORAGE_KEY = PENDING_CLAIMS_STORAGE_KEY

const CHANGE_EVENT = 'hb-pending-claims-change'

export function subscribePendingClaims(listener: () => void): () => void {
  // Another tab claiming funds only reaches this one as a `storage` event.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return
    try {
      if (event.storageArea !== window.localStorage) return
    } catch {
      return
    }
    listener()
  }
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function getPendingClaims(address?: string): PendingClaim[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PendingClaim[]
    if (!Array.isArray(parsed)) return []

    // Validate each record: keep only well-formed entries
    const valid = parsed.filter((c) => {
      // Must have id, hash, and timestamp
      if (!c || typeof c !== 'object') return false
      if (typeof c.id !== 'string' || !c.id) return false
      if (typeof c.hash !== 'string' || !c.hash) return false
      if (
        typeof c.timestamp !== 'number' ||
        c.timestamp <= 0 ||
        !Number.isFinite(new Date(c.timestamp).getTime())
      )
        return false
      return true
    })

    if (address) {
      return valid.filter((c) => c.address === address)
    }
    return valid
  } catch {
    return []
  }
}

export function addPendingClaim(claim: PendingClaim): void {
  try {
    const current = getPendingClaims()
    const next = [claim, ...current.filter((c) => c.hash !== claim.hash && c.id !== claim.id)]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    /* ignore storage errors */
  }
}

export function removePendingClaim(idOrHash: string): void {
  try {
    const current = getPendingClaims()
    const next = current.filter((c) => c.id !== idOrHash && c.hash !== idOrHash)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    /* ignore storage errors */
  }
}

export function clearPendingClaims(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    /* ignore storage errors */
  }
}
