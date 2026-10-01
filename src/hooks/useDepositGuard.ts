/**
 * useDepositGuard - idempotent deposit retry protection (Issue #433).
 *
 * When a user submits a deposit and the network times out or they cancel,
 * the transaction may still be processing server-side. Submitting again
 * would cause a duplicate investment.
 *
 * This hook persists a "pending deposit" record in sessionStorage so that if
 * the user returns to the deposit form before confirmation, we can warn them
 * that a prior submission may still be in-flight.
 *
 * sessionStorage is used (not localStorage) so the guard is scoped to the
 * current browser tab - a deliberate wallet session - and clears automatically
 * when the tab is closed.
 */

import { useCallback } from 'react'

const STORAGE_KEY = 'hb_pending_deposit'

/** Maximum age (ms) for a pending deposit record to be considered active. */
const PENDING_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface PendingDeposit {
  /** USDC amount of the in-flight deposit. */
  amount: number
  /** Unix timestamp (ms) when the submission started. */
  startedAt: number
  /** Stellar address that initiated the deposit. */
  address: string
}

export function useDepositGuard() {
  /**
   * Mark a deposit as in-flight. Call this immediately before calling
   * `SubmitDeposit` so that any subsequent render (e.g. after abort/timeout)
   * can detect the pending state.
   */
  const markPending = useCallback((amount: number, address: string) => {
    const record: PendingDeposit = { amount, startedAt: Date.now(), address }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
      // sessionStorage unavailable (private mode, quota exceeded) - degrade silently
    }
  }, [])

  /**
   * Clear the pending record once the deposit has reached a terminal state
   * (success or a confirmed failure such as on-chain rejection).
   * Aborts / timeouts do NOT clear the record - the tx may still be processing.
   */
  const clearPending = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  /**
   * Read the current pending deposit record.
   * Returns `null` if there is no record or it has expired past the TTL.
   */
  const getPending = useCallback((): PendingDeposit | null => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const record = JSON.parse(raw) as PendingDeposit
      if (Date.now() - record.startedAt > PENDING_TTL_MS) {
        // Expired - clean up and treat as no pending record
        sessionStorage.removeItem(STORAGE_KEY)
        return null
      }
      return record
    } catch {
      return null
    }
  }, [])

  return { markPending, clearPending, getPending }
}
