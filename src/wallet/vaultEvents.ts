/**
 * Vault Event Dispatcher for instant balance and state refresh on transaction confirmation (#605).
 */

type Listener = () => void

const listeners = new Set<Listener>()

/**
 * Subscribe to confirmed user transactions (deposit, withdraw, claim, yield claim).
 * @param callback Callback function to run when a transaction completes.
 * @returns Cleanup function to unsubscribe listener.
 */
export function subscribeTransactionConfirmed(callback: Listener): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

/**
 * Notify all subscribers that a vault transaction has been confirmed on-chain.
 */
export function notifyTransactionConfirmed(_txHash?: string, _type?: string): void {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // Ignore listener errors
    }
  })
}
