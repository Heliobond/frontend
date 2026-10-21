import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECURRING_CHANGED_EVENT,
  RECURRING_STORAGE_KEY,
  readRecurringInvestments,
} from '../lib/recurringInvestments'
import { RecurringInvestmentSync } from './RecurringInvestmentSync'

const mocks = vi.hoisted(() => ({ useRemoteSync: vi.fn() }))
vi.mock('./useRemoteSync', () => ({ useRemoteSync: mocks.useRemoteSync }))

const first = {
  bondId: 'bond-a',
  amount: 100,
  dayOfMonth: 5,
  createdAt: '2026-01-01',
  active: true,
}
const second = { ...first, amount: 200, createdAt: '2026-02-01' }

beforeEach(() => {
  localStorage.clear()
  mocks.useRemoteSync.mockClear()
})

afterEach(() => localStorage.clear())

describe('RecurringInvestmentSync', () => {
  it('hydrates from local storage and listens for same-tab changes', () => {
    localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify([first]))
    render(<RecurringInvestmentSync />)
    expect(mocks.useRemoteSync).toHaveBeenLastCalledWith(
      expect.objectContaining({ resource: 'recurring', value: [first] }),
    )

    localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify([second]))
    act(() => window.dispatchEvent(new Event(RECURRING_CHANGED_EVENT)))
    expect(mocks.useRemoteSync).toHaveBeenLastCalledWith(
      expect.objectContaining({ resource: 'recurring', value: [second] }),
    )
  })

  it('merges by bond and creation time, retaining local-only plans', () => {
    render(<RecurringInvestmentSync />)
    const options = mocks.useRemoteSync.mock.lastCall?.[0]
    expect(options.merge([first, second], [{ ...first, amount: 150 }])).toEqual([
      { ...first, amount: 150 },
      second,
    ])
    expect(readRecurringInvestments()).toEqual([])
  })
})
