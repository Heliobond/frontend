import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVisibleNow } from './useVisibleNow'

const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden')

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
}

afterEach(() => {
  if (hiddenDescriptor) {
    Object.defineProperty(document, 'hidden', hiddenDescriptor)
  } else {
    Reflect.deleteProperty(document, 'hidden')
  }
  vi.useRealTimers()
})

describe('useVisibleNow', () => {
  it('ticks while visible, pauses while hidden, and catches up on return', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(5_000))
    setDocumentHidden(false)

    const { result } = renderHook(() => useVisibleNow('seconds'))
    expect(result.current).toBe(5)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(6)

    setDocumentHidden(true)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(6)

    setDocumentHidden(false)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current).toBe(11)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(12)
  })
})
