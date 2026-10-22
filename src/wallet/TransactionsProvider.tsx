'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { SOROBAN_RPC_URL, STELLAR_NETWORK } from '../config/network'
import { notifyTransactionConfirmed } from './vaultEvents'
import {
  type TransactionItem,
  type TransactionStatus,
  getTransactions,
  getServerTransactions,
  subscribeTransactions,
  recordTransaction,
  updateTransaction,
  clearCompletedTransactions,
  isPending,
} from './transactions'
export type { TransactionItem, TransactionStatus, TransactionKind } from './transactions'

interface TransactionsContextValue {
  transactions: TransactionItem[]
  pendingCount: number
  addTransaction: typeof recordTransaction
  updateTransactionStatus: typeof updateTransaction
  clearCompleted: typeof clearCompletedTransactions
}
const TransactionsContext = createContext<TransactionsContextValue | null>(null)

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const transactions = useSyncExternalStore(
    subscribeTransactions,
    getTransactions,
    getServerTransactions,
  )
  useEffect(() => {
    let stopped = false
    let polling = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let backoffLevel = 0
    let pollOnResume = false
    const baseDelay = 10000
    const maxDelay = 60000
    const isHidden = () => typeof document !== 'undefined' && document.hidden

    const schedulePoll = (delay: number) => {
      if (stopped || isHidden() || timer !== undefined || !getTransactions().some(isPending)) return
      timer = setTimeout(() => {
        timer = undefined
        void poll()
      }, delay)
    }

    const poll = async () => {
      if (stopped || isHidden() || polling) return
      polling = true
      let hadFailure = false
      let hasTimedOutPending = false
      let hadSuccessfulResponse = false
      try {
        for (const item of getTransactions().filter(isPending)) {
          if (stopped || isHidden()) break
          // Do not send a restored hash to a different configured chain or arbitrary stored URL.
          if (
            (item.network && item.network !== STELLAR_NETWORK) ||
            (item.rpcUrl && item.rpcUrl !== SOROBAN_RPC_URL)
          )
            continue
          const isTimedOut = Date.now() - item.submittedAt >= 30000
          if (item.status === 'pending' && isTimedOut)
            updateTransaction(item.hash, 'timeout_pending')
          const requestController = new AbortController()
          controller = requestController
          let requestTimedOut = false
          const timeout = setTimeout(() => {
            requestTimedOut = true
            requestController.abort()
          }, 8000)
          try {
            const response = await fetch(SOROBAN_RPC_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: requestController.signal,
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: { hash: item.hash },
              }),
            })
            if (requestController.signal.aborted) {
              if (requestTimedOut && !isHidden()) hadFailure = true
              break
            }
            if (!response.ok) {
              if (!isHidden()) hadFailure = true
              continue
            }
            const data = await response.json()
            if (stopped || isHidden() || requestController.signal.aborted) continue
            const current = getTransactions().find((tx) => tx.hash === item.hash)
            if (!current || !isPending(current)) continue
            let status: TransactionStatus = isTimedOut ? 'timeout_pending' : 'pending'
            if (data.result?.status === 'SUCCESS') status = 'confirmed'
            if (data.result?.status === 'FAILED') status = 'failed'
            hadSuccessfulResponse = true
            if (status === 'timeout_pending') hasTimedOutPending = true
            updateTransaction(item.hash, status, {
              error: status === 'failed' ? 'Transaction failed on-chain' : undefined,
            })
            if (status === 'confirmed') notifyTransactionConfirmed(item.hash, item.kind)
          } catch {
            if (!isHidden() && (!requestController.signal.aborted || requestTimedOut))
              hadFailure = true
            /* An unavailable node cannot establish failure. Retry later. */
          } finally {
            clearTimeout(timeout)
            if (controller === requestController) controller = undefined
          }
          if (requestController.signal.aborted) break
          const current = getTransactions().find((tx) => tx.hash === item.hash)
          if (
            !stopped &&
            !isHidden() &&
            current?.status === 'pending' &&
            Date.now() - current.submittedAt >= 30000
          ) {
            updateTransaction(item.hash, 'timeout_pending')
            hasTimedOutPending = true
          }
        }
      } finally {
        polling = false
      }
      if (stopped || isHidden()) return
      if (pollOnResume) {
        pollOnResume = false
        schedulePoll(0)
        return
      }
      let delay = baseDelay
      if (hadFailure || hasTimedOutPending) {
        delay = Math.min(baseDelay * 2 ** backoffLevel, maxDelay)
        backoffLevel = Math.min(backoffLevel + 1, 3)
      } else if (hadSuccessfulResponse) {
        backoffLevel = 0
      }
      schedulePoll(delay)
    }

    const onVisibilityChange = () => {
      if (isHidden()) {
        if (timer !== undefined) clearTimeout(timer)
        timer = undefined
        controller?.abort()
      } else {
        if (polling) pollOnResume = true
        else if (timer !== undefined) clearTimeout(timer)
        timer = undefined
        void poll()
      }
    }
    const onTransactionsChange = () => {
      if (getTransactions().some(isPending) && !isHidden()) {
        if (timer !== undefined) clearTimeout(timer)
        timer = undefined
        void poll()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    const unsubscribe = subscribeTransactions(onTransactionsChange)
    void poll()
    return () => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unsubscribe()
    }
  }, [])

  const value = useMemo<TransactionsContextValue>(() => {
    let pendingCount = 0
    for (let i = 0; i < transactions.length; i++) {
      if (isPending(transactions[i])) {
        pendingCount++
      }
    }
    return {
      transactions,
      pendingCount,
      addTransaction: recordTransaction,
      updateTransactionStatus: updateTransaction,
      clearCompleted: clearCompletedTransactions,
    }
  }, [transactions])

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>
}
const defaultContextValue: TransactionsContextValue = {
  transactions: [],
  pendingCount: 0,
  addTransaction: recordTransaction,
  updateTransactionStatus: updateTransaction,
  clearCompleted: clearCompletedTransactions,
}
export function useTransactions() {
  return useContext(TransactionsContext) ?? defaultContextValue
}
