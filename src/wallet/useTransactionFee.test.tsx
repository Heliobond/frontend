import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vault from './vault'
import { useTransactionFee } from './useTransactionFee'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useTransactionFee', () => {
  it('debounces valid estimates and returns the latest fee', async () => {
    const estimate = vi.spyOn(vault, 'estimateTransactionFee').mockResolvedValue(0.025)
    const { result, rerender } = renderHook(
      ({ amount }) => useTransactionFee('deposit', amount, 'G-ADDRESS', 0.5),
      { initialProps: { amount: 100 } },
    )
    rerender({ amount: 200 })
    expect(result.current).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(estimate).toHaveBeenCalledTimes(1)
    expect(estimate).toHaveBeenCalledWith('deposit', 200, 'G-ADDRESS', 0.5)
    expect(result.current).toBe(0.025)
  })

  it('does not estimate invalid input and ignores a result after unmount', async () => {
    const estimate = vi.spyOn(vault, 'estimateTransactionFee').mockResolvedValue(0.01)
    const { unmount } = renderHook(() => useTransactionFee('withdraw', 0, 'G-ADDRESS', 0.5))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(estimate).not.toHaveBeenCalled()

    let resolve!: (value: number) => void
    estimate.mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const mounted = renderHook(() => useTransactionFee('withdraw', 10, 'G-ADDRESS', 0.5))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    mounted.unmount()
    await act(async () => resolve(0.01))
    unmount()
  })
})
