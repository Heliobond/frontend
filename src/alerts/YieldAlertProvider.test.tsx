import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAlerts, writeAlerts, type YieldAlert } from '../lib/yieldAlerts'
import { selectProjects } from '../state/selectors'
import { YieldAlertProvider, useYieldAlerts } from './YieldAlertProvider'

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))

vi.mock('../components/Toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <YieldAlertProvider>{children}</YieldAlertProvider>
)

const makeAlert = (): YieldAlert => ({
  id: 'alert-1',
  bondId: selectProjects()[0].id,
  bondName: 'Test bond',
  threshold: -100000,
  operator: 'above',
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('YieldAlertProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    writeAlerts([])
    toastMock.mockClear()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('does not register an interval without alerts and starts one when an alert is added', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result, unmount } = renderHook(useYieldAlerts, { wrapper })

    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    let alert!: YieldAlert
    act(() => {
      alert = result.current.add(makeAlert().bondId, 'Test bond', -100000, 'above')
    })
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000)
    expect(result.current.getAlertsForBond(alert.bondId)).toEqual([alert])
    expect(result.current.hasAlertForBond(alert.bondId)).toBe(true)

    act(() => result.current.update(alert.id, 10, 'below'))
    expect(getAlerts()[0]).toMatchObject({ threshold: 10, operator: 'below' })
    act(() => result.current.remove(alert.id))
    expect(result.current.count).toBe(0)
    expect(clearIntervalSpy).toHaveBeenCalled()
    unmount()
  })

  it('skips hidden-tab evaluations and evaluates immediately when the tab becomes visible', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    writeAlerts([makeAlert()])
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const { unmount } = renderHook(useYieldAlerts, { wrapper })

    expect(setIntervalSpy).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(120_000))
    expect(toastMock).not.toHaveBeenCalled()

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(getAlerts()[0].lastTriggeredAt).toBeDefined()
    unmount()
  })
})
