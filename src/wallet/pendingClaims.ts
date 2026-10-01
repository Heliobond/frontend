/**
 * Storage and management of queued withdrawal claims.
 * Persists pending claims across page reloads in localStorage.
 */

export interface PendingClaim {
  id: string
  hash: string
  amount?: number
  timestamp: number
  address?: string
}

const STORAGE_KEY = 'hb-pending-claims'

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getPendingClaims(address?: string): PendingClaim[] {
  if (!isStorageAvailable()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PendingClaim[]
    if (!Array.isArray(parsed)) return []
    if (address) {
      return parsed.filter((c) => !c.address || c.address === address)
    }
    return parsed
  } catch {
    return []
  }
}

export function addPendingClaim(claim: PendingClaim): void {
  if (!isStorageAvailable()) return
  try {
    const current = getPendingClaims()
    const next = [claim, ...current.filter((c) => c.hash !== claim.hash && c.id !== claim.id)]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore storage errors */
  }
}

export function removePendingClaim(idOrHash: string): void {
  if (!isStorageAvailable()) return
  try {
    const current = getPendingClaims()
    const next = current.filter((c) => c.id !== idOrHash && c.hash !== idOrHash)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore storage errors */
  }
}

export function clearPendingClaims(): void {
  if (!isStorageAvailable()) return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore storage errors */
  }
}
