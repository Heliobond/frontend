// Bond watchlist — lightweight client-side persistence + status helpers for
// issue #407. People save bonds (projects) they want to track without
// investing; the list lives in localStorage under `hb-watchlist` and is
// mirrored into React state by `WatchlistProvider`.

import { type BondStatus, type Project } from '../data'

export const WATCHLIST_STORAGE_KEY = 'hb-watchlist'

/**
 * Read the saved bond ids. Returns [] when storage is empty or unreadable.
 * Applies the registry's ID constraints (integers from 1 to 2^32 - 1) and
 * deduplicates entries at the storage boundary.
 */
export function readWatchlist(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(WATCHLIST_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    // Filter to valid project IDs: integers in [1, 2^32 - 1]
    const valid = parsed.filter(
      (id): id is number =>
        typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= 0xffffffff,
    )

    // Deduplicate, preserving the first occurrence of each ID
    return [...new Set(valid)]
  } catch {
    return []
  }
}

/** Persist the saved bond ids. No-ops when storage is unavailable. */
export function writeWatchlist(ids: number[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* private mode / storage disabled — the watchlist just won't persist */
  }
}

/**
 * Funding availability for a bond. Uses the explicit `status` when the data
 * carries one, otherwise derives it from the funding numbers so remote API
 * rows without the field still resolve to something sensible.
 */
export function getBondStatus(
  project: Pick<Project, 'status' | 'fundedAmount' | 'fundingGoal'>,
): BondStatus {
  if (project.status) return project.status
  if (project.fundingGoal > 0 && project.fundedAmount >= project.fundingGoal) return 'funded'
  return 'open'
}

/** True when a bond is open for funding from the pool right now. */
export function isBondAvailable(
  project: Pick<Project, 'status' | 'fundedAmount' | 'fundingGoal'>,
): boolean {
  return getBondStatus(project) === 'open'
}
