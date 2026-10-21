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
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const poll = async () => {
      for (const item of getTransactions().filter(isPending)) {
        if (stopped) return
        // Do not send a restored hash to a different configured chain or arbitrary stored URL.
        if (
          (item.network && item.network !== STELLAR_NETWORK) ||
          (item.rpcUrl && item.rpcUrl !== SOROBAN_RPC_URL)
        )
          continue
        if (item.status === 'pending' && Date.now() - item.submittedAt >= 30000)
          updateTransaction(item.hash, 'timeout_pending')
        controller = new AbortController()
        const signal = controller.signal
        const timeout = setTimeout(() => controller?.abort(), 8000)
        try {
          const response = await fetch(SOROBAN_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: { hash: item.hash },
            }),
          })
          if (!response.ok) continue
          const data = await response.json()
          if (stopped) return
          if (signal.aborted) continue
          const current = getTransactions().find((tx) => tx.hash === item.hash)
          if (!current || !isPending(current)) continue
          let status: TransactionStatus =
            Date.now() - item.submittedAt >= 30000 ? 'timeout_pending' : 'pending'
          if (data.result?.status === 'SUCCESS') status = 'confirmed'
          if (data.result?.status === 'FAILED') status = 'failed'
          updateTransaction(item.hash, status, {
            error: status === 'failed' ? 'Transaction failed on-chain' : undefined,
          })
          if (status === 'confirmed') notifyTransactionConfirmed(item.hash, item.kind)
        } catch {
          /* An unavailable node cannot establish failure. Retry later. */
        } finally {
          clearTimeout(timeout)
        }
        const current = getTransactions().find((tx) => tx.hash === item.hash)
        if (
          !stopped &&
          current?.status === 'pending' &&
          Date.now() - current.submittedAt >= 30000
        ) {
          updateTransaction(item.hash, 'timeout_pending')
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), 10000)
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
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
