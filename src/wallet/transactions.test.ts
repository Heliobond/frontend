import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearCompletedTransactions,
  getTransactions,
  isPending,
  recordTransaction,
  subscribeTransactions,
  TRANSACTIONS_KEY,
  TransactionPendingError,
  updateTransaction,
} from './transactions'

const pending = (hash: string) => ({
  hash,
  kind: 'deposit',
  status: 'pending' as const,
  submittedAt: 123,
})

beforeEach(() => {
  sessionStorage.clear()
  getTransactions().forEach((item) => updateTransaction(item.hash, 'confirmed'))
  clearCompletedTransactions()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('transactions store', () => {
  it('restores only valid pending entries and persists new entries', () => {
    sessionStorage.setItem(
      TRANSACTIONS_KEY,
      JSON.stringify([pending('restored'), { ...pending('bad'), amount: -1 }]),
    )
    const unsubscribe = subscribeTransactions(() => {})
    expect(getTransactions().map((item) => item.hash)).toEqual(['restored'])

    recordTransaction(pending('new'))
    expect(JSON.parse(sessionStorage.getItem(TRANSACTIONS_KEY)!)).toHaveLength(2)
    unsubscribe()
  })

  it('preserves terminal status when an older pending result arrives late', () => {
    recordTransaction(pending('race'))
    updateTransaction('race', 'confirmed')
    recordTransaction(pending('race'))
    expect(getTransactions()[0].status).toBe('confirmed')
  })

  it('keeps timeout-pending items active and clears completed items', () => {
    recordTransaction(pending('timeout'))
    updateTransaction('timeout', 'timeout_pending')
    expect(isPending(getTransactions()[0])).toBe(true)
    updateTransaction('timeout', 'failed')
    clearCompletedTransactions()
    expect(getTransactions()).toEqual([])
    expect(JSON.parse(sessionStorage.getItem(TRANSACTIONS_KEY)!)).toEqual([])
  })

  it('exposes a typed pending error with the transaction hash', () => {
    const error = new TransactionPendingError('tx-hash')
    expect(error).toMatchObject({ name: 'TransactionPendingError', hash: 'tx-hash' })
    expect(error.message).toContain('Still pending')
  })
})
