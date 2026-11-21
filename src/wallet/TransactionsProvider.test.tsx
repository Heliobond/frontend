import { useState, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionsProvider, useTransactions } from './TransactionsProvider'
import { TRANSACTIONS_KEY, recordTransaction } from './transactions'
import { STELLAR_NETWORK } from '../config/network'
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
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  sessionStorage.clear()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
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

  it.each(['timeout', 'hide', 'unmount'])(
    'only continues to later hashes after a per-request timeout (%s)',
    async (interrupt) => {
      vi.useFakeTimers()
      sessionStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([saved('slow'), saved('later')]))
      vi.mocked(fetch)
        .mockImplementationOnce(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
            }),
        )
        .mockResolvedValueOnce(rpc('SUCCESS'))

      const { result, unmount } = renderHook(useTransactions, { wrapper })
      expect(fetch).toHaveBeenCalledTimes(1)
      const signal = vi.mocked(fetch).mock.calls[0][1]?.signal

      await act(async () => {
        if (interrupt === 'hide') {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true })
          document.dispatchEvent(new Event('visibilitychange'))
        }
        if (interrupt === 'unmount') unmount()
        await vi.advanceTimersByTimeAsync(8000)
      })

      expect(signal?.aborted).toBe(true)
      expect(fetch).toHaveBeenCalledTimes(interrupt === 'timeout' ? 2 : 1)
      if (interrupt === 'timeout') {
        expect(result.current.transactions.find((item) => item.hash === 'later')?.status).toBe(
          'confirmed',
        )
      }
    },
  )

  it.each([
    { network: STELLAR_NETWORK === 'testnet' ? 'public' : 'testnet' },
    { rpcUrl: 'https://foreign.example.test' },
  ])('schedules nothing for ineligible restored entries (%o)', async (scope) => {
    vi.useFakeTimers()
    sessionStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([{ ...saved('foreign'), ...scope }]))
    vi.mocked(fetch).mockResolvedValue(rpc('SUCCESS'))
    const schedule = vi.spyOn(globalThis, 'setTimeout')
    const { result } = renderHook(useTransactions, { wrapper })

    expect(fetch).not.toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalledWith(expect.any(Function), 10000)
    expect(result.current.pendingCount).toBe(1)

    await act(async () => {
      recordTransaction(saved('local'))
    })

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      expect.objectContaining({ body: expect.stringContaining('"hash":"local"') }),
    )
    expect(result.current.transactions.map(({ hash, status }) => [hash, status])).toEqual([
      ['local', 'confirmed'],
      ['foreign', 'pending'],
    ])
    expect(schedule).not.toHaveBeenCalledWith(expect.any(Function), 10000)
  })

  it('pauses polling while hidden and polls immediately when visible', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([saved()]))
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const { unmount } = renderHook(useTransactions, { wrapper })
    expect(fetch).not.toHaveBeenCalled()

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('backs off after errors and resets the delay after a successful response', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([saved()]))
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(rpc('NOT_FOUND'))
      .mockRejectedValueOnce(new Error('offline'))
    const { unmount } = renderHook(useTransactions, { wrapper })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999)
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999)
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    unmount()
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
