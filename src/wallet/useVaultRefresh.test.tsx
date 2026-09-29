import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useVaultRefresh } from './useVaultRefresh'
import { notifyTransactionConfirmed } from './vaultEvents'

vi.mock('../lib/websocket', () => ({ subscribeVaultEvents: () => () => {} }))
const visibility = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}
beforeEach(() => {
  vi.useFakeTimers()
  visibility(false)
})
afterEach(() => {
  vi.useRealTimers()
  visibility(false)
})
it('pauses periodic and transaction refreshes while hidden, then resumes exactly one timer', () => {
  const { result, unmount } = renderHook(() => useVaultRefresh(true))
  act(() => vi.advanceTimersByTime(30000))
  expect(result.current.tick).toBe(1)
  act(() => {
    visibility(true)
    notifyTransactionConfirmed()
    vi.advanceTimersByTime(90000)
  })
  expect(result.current.tick).toBe(1)
  act(() => visibility(false))
  expect(result.current.tick).toBe(2)
  act(() => vi.advanceTimersByTime(30000))
  expect(result.current.tick).toBe(3)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('does not subscribe or poll for disabled consumers', () => {
  const { result } = renderHook(() => useVaultRefresh(false))
  act(() => {
    notifyTransactionConfirmed()
    vi.advanceTimersByTime(60000)
  })
  expect(result.current.tick).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})
