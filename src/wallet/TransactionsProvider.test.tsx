import { useState, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionsProvider, useTransactions } from './TransactionsProvider'
import { TRANSACTIONS_KEY, recordTransaction } from './transactions'
import { subscribeTransactionConfirmed } from './vaultEvents'

const wrapper = ({ children }: { children: ReactNode }) => (
  <TransactionsProvider>{children}</TransactionsProvider>
)
const saved = (hash = 'persisted') => ({
  hash,
  kind: 'deposit',
  amount: 100,
  status: 'pending' as const,
  submittedAt: Date.now(),
})
const rpc = (status: string) =>
  ({ ok: true, json: async () => ({ result: { status } }) }) as Response
beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rpc('NOT_FOUND')))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('TransactionsProvider', () => {
  it('records pending submissions synchronously and preserves timestamp on settlement', () => {
    const { result } = renderHook(useTransactions, { wrapper })
    const item = saved('new')
    act(() => recordTransaction(item))
    expect(result.current.pendingCount).toBe(1)
    expect(JSON.parse(sessionStorage.getItem(TRANSACTIONS_KEY)!)[0].hash).toBe('new')
    act(() => result.current.updateTransactionStatus('new', 'confirmed'))
    expect(result.current.transactions[0].submittedAt).toBe(item.submittedAt)
    expect(result.current.pendingCount).toBe(0)
    expect(JSON.parse(sessionStorage.getItem(TRANSACTIONS_KEY)!)).toEqual([])
    act(() => result.current.clearCompleted())
    expect(result.current.transactions).toEqual([])
  })

  it('resumes a restored pending transaction and notifies balance subscribers on confirmation', async () => {
    sessionStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([saved()]))
    vi.mocked(fetch).mockResolvedValue(rpc('SUCCESS'))
    const confirmed = vi.fn()
    const unsubscribe = subscribeTransactionConfirmed(confirmed)
    const { result } = renderHook(useTransactions, { wrapper })
    await waitFor(() => expect(result.current.transactions[0].status).toBe('confirmed'))
    expect(confirmed).toHaveBeenCalledWith('persisted', 'deposit')
    expect(JSON.parse(sessionStorage.getItem(TRANSACTIONS_KEY)!)).toEqual([])
    unsubscribe()
  })

  it('marks a restored on-chain failure and does not emit confirmation', async () => {
    sessionStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([saved()]))
    vi.mocked(fetch).mockResolvedValue(rpc('FAILED'))
    const { result } = renderHook(useTransactions, { wrapper })
    await waitFor(() => expect(result.current.transactions[0].status).toBe('failed'))
    expect(result.current.pendingCount).toBe(0)
  })

  it('keeps checking after timeout and network errors until success', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem(
      TRANSACTIONS_KEY,
      JSON.stringify([{ ...saved(), submittedAt: Date.now() - 31000 }]),
    )
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(rpc('SUCCESS'))
    const { result, unmount } = renderHook(useTransactions, { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.transactions[0].status).toBe('timeout_pending')
    expect(result.current.pendingCount).toBe(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(result.current.transactions[0].status).toBe('confirmed')
    unmount()
    const calls = vi.mocked(fetch).mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(fetch).toHaveBeenCalledTimes(calls)
  })

  it('does not downgrade a confirmed item when a foreground timeout arrives late', () => {
    const { result } = renderHook(useTransactions, { wrapper })
    act(() => recordTransaction(saved('race')))
    act(() => result.current.updateTransactionStatus('race', 'confirmed'))
    act(() => result.current.updateTransactionStatus('race', 'timeout_pending'))
    expect(result.current.transactions[0].status).toBe('confirmed')
    expect(result.current.pendingCount).toBe(0)
  })

  it.each(['null', '{}', '[{"hash":123}]', 'invalid json'])(
    'ignores invalid storage: %s',
    (value) => {
      sessionStorage.setItem(TRANSACTIONS_KEY, value)
      const { result } = renderHook(useTransactions, { wrapper })
      expect(result.current.transactions).toEqual([])
    },
  )

  it('preserves value reference across parent re-renders with unchanged transactions', () => {
    let triggerParentRender!: () => void

    function Parent({ children }: { children: React.ReactNode }) {
      const [, setTick] = useState(0)
      triggerParentRender = () => setTick((t) => t + 1)
      return <TransactionsProvider>{children}</TransactionsProvider>
    }

    const { result } = renderHook(() => useTransactions(), { wrapper: Parent })
    const initialValue = result.current

    act(() => {
      triggerParentRender()
    })

    expect(result.current).toBe(initialValue)
  })
})
