import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from '@/test/bun'
import * as vault from './vault'
import { useTransactionFee } from './useTransactionFee'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useTransactionFee', () => {
  it('debounces valid estimates, reports pending state, and returns the latest fee', async () => {
    const estimate = vi.spyOn(vault, 'estimateTransactionFee').mockResolvedValue(0.025)
    const { result, rerender } = renderHook(
      ({ amount }) => useTransactionFee('deposit', amount, 'G-ADDRESS', 0.5),
      { initialProps: { amount: 100 } },
    )
    expect(result.current.isPending).toBe(true)
    expect(result.current.status).toBe('pending')
    expect(result.current.fee).toBeNull()
    expect(result.current.isUnavailable).toBe(false)

    rerender({ amount: 200 })
    expect(result.current.isPending).toBe(true)
    expect(result.current.status).toBe('pending')
    expect(result.current.fee).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(estimate).toHaveBeenCalledTimes(1)
    expect(estimate).toHaveBeenCalledWith('deposit', 200, 'G-ADDRESS', 0.5)
    expect(result.current.isPending).toBe(false)
    expect(result.current.status).toBe('success')
    expect(result.current.isUnavailable).toBe(false)
    expect(result.current.fee).toBe(0.025)
  })

  it('marks failed simulation as unavailable and never reuses prior estimate on amount change', async () => {
    const estimate = vi.spyOn(vault, 'estimateTransactionFee').mockResolvedValue(0.025)
    const { result, rerender } = renderHook(
      ({ amount }) => useTransactionFee('deposit', amount, 'G-ADDRESS', 0.5),
      { initialProps: { amount: 100 } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current.fee).toBe(0.025)
    expect(result.current.status).toBe('success')

    // Changing amount immediately drops prior estimate and reports pending
    estimate.mockRejectedValueOnce(new Error('Network error'))
    rerender({ amount: 300 })
    expect(result.current.fee).toBeNull()
    expect(result.current.isPending).toBe(true)
    expect(result.current.status).toBe('pending')
    expect(result.current.isUnavailable).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current.fee).toBeNull()
    expect(result.current.isPending).toBe(false)
    expect(result.current.status).toBe('unavailable')
    expect(result.current.isUnavailable).toBe(true)

    // Changing amount again drops unavailable state and reports pending for new amount
    estimate.mockResolvedValueOnce(0.03)
    rerender({ amount: 400 })
    expect(result.current.fee).toBeNull()
    expect(result.current.isPending).toBe(true)
    expect(result.current.status).toBe('pending')
    expect(result.current.isUnavailable).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current.fee).toBe(0.03)
    expect(result.current.status).toBe('success')
  })

  it('does not estimate invalid input and ignores a result after unmount', async () => {
    const estimate = vi.spyOn(vault, 'estimateTransactionFee').mockResolvedValue(0.01)
    const { result, unmount } = renderHook(() => useTransactionFee('withdraw', 0, 'G-ADDRESS', 0.5))
    expect(result.current.status).toBe('idle')
    expect(result.current.isPending).toBe(false)
    expect(result.current.fee).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(estimate).not.toHaveBeenCalled()

    let resolve!: (value: number) => void
    estimate.mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const mounted = renderHook(() => useTransactionFee('withdraw', 10, 'G-ADDRESS', 0.5))
    expect(mounted.result.current.isPending).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    mounted.unmount()
    await act(async () => resolve(0.01))
    unmount()
  })
})
