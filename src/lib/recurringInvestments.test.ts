// Unit tests for recurring investments module

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  writeRecurringInvestments,
  saveRecurringInvestment,
  readRecurringInvestments,
  RECURRING_STORAGE_KEY,
  RECURRING_CHANGED_EVENT,
  type RecurringInvestmentPlan,
} from './recurringInvestments'

describe('recurringInvestments', () => {
  // Mock localStorage and window events
  const mockLocalStorage: { [key: string]: string } = {}
  const mockEventListeners: { [key: string]: EventListener[] } = {}

  beforeEach(() => {
    // Reset mocks
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key])
    Object.keys(mockEventListeners).forEach((key) => delete mockEventListeners[key])

    global.localStorage = {
      getItem: (key: string) => mockLocalStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockLocalStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockLocalStorage[key]
      },
      clear: () => {
        Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key])
      },
      key: (index: number) => Object.keys(mockLocalStorage)[index] ?? null,
      length: Object.keys(mockLocalStorage).length,
    }

    global.window = {
      localStorage: global.localStorage,
      dispatchEvent: vi.fn((event: Event) => {
        const listeners = mockEventListeners[event.type] ?? []
        listeners.forEach((listener) => listener(event))
        return true
      }),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (!mockEventListeners[type]) mockEventListeners[type] = []
        mockEventListeners[type].push(listener)
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (!mockEventListeners[type]) return
        mockEventListeners[type] = mockEventListeners[type].filter((l) => l !== listener)
      }),
    } as unknown as Window & typeof globalThis
  })

  describe('readRecurringInvestments', () => {
    it('should return empty array when storage is empty', () => {
      const plans = readRecurringInvestments()
      expect(plans).toEqual([])
    })

    it('should return empty array when storage contains invalid JSON', () => {
      mockLocalStorage[RECURRING_STORAGE_KEY] = 'invalid json{'
      const plans = readRecurringInvestments()
      expect(plans).toEqual([])
    })

    it('should return empty array when stored value is not an array', () => {
      mockLocalStorage[RECURRING_STORAGE_KEY] = JSON.stringify({ notAnArray: true })
      const plans = readRecurringInvestments()
      expect(plans).toEqual([])
    })

    it('should parse valid plans correctly', () => {
      const stored: RecurringInvestmentPlan[] = [
        {
          bondId: '1',
          amount: 100,
          dayOfMonth: 15,
          createdAt: '2024-01-01T00:00:00Z',
          active: true,
        },
      ]
      mockLocalStorage[RECURRING_STORAGE_KEY] = JSON.stringify(stored)
      const plans = readRecurringInvestments()
      expect(plans).toEqual(stored)
    })

    it('should return empty array in SSR context (window undefined)', () => {
      const originalWindow = global.window
      // @ts-expect-error - testing SSR
      delete global.window
      const plans = readRecurringInvestments()
      expect(plans).toEqual([])
      global.window = originalWindow
    })
  })

  describe('writeRecurringInvestments', () => {
    it('should persist plans to localStorage', () => {
      const plans: RecurringInvestmentPlan[] = [
        {
          bondId: '1',
          amount: 100,
          dayOfMonth: 15,
          createdAt: '2024-01-01T00:00:00Z',
          active: true,
        },
      ]
      writeRecurringInvestments(plans)
      expect(mockLocalStorage[RECURRING_STORAGE_KEY]).toBe(JSON.stringify(plans))
    })

    it('should dispatch RECURRING_CHANGED_EVENT after write', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const plans: RecurringInvestmentPlan[] = []
      writeRecurringInvestments(plans)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: RECURRING_CHANGED_EVENT }),
      )
    })

    it('should handle write errors gracefully (no-op)', () => {
      global.localStorage.setItem = () => {
        throw new Error('Storage full')
      }
      const plans: RecurringInvestmentPlan[] = []
      // Should not throw
      expect(() => writeRecurringInvestments(plans)).not.toThrow()
    })

    it('should no-op in SSR context (window undefined)', () => {
      const originalWindow = global.window
      // @ts-expect-error - testing SSR
      delete global.window
      const plans: RecurringInvestmentPlan[] = []
      expect(() => writeRecurringInvestments(plans)).not.toThrow()
      global.window = originalWindow
    })
  })

  describe('saveRecurringInvestment', () => {
    it('should create a new plan with createdAt and active=true', () => {
      const input = {
        bondId: '42',
        amount: 250,
        dayOfMonth: 1,
      }
      const plan = saveRecurringInvestment(input)
      expect(plan.bondId).toBe('42')
      expect(plan.amount).toBe(250)
      expect(plan.dayOfMonth).toBe(1)
      expect(plan.active).toBe(true)
      expect(plan.createdAt).toBeTruthy()
      expect(new Date(plan.createdAt).getTime()).toBeGreaterThan(0)
    })

    it('should append new plan to existing plans', () => {
      const existing: RecurringInvestmentPlan[] = [
        {
          bondId: '1',
          amount: 100,
          dayOfMonth: 15,
          createdAt: '2024-01-01T00:00:00Z',
          active: true,
        },
      ]
      mockLocalStorage[RECURRING_STORAGE_KEY] = JSON.stringify(existing)

      const input = { bondId: '2', amount: 200, dayOfMonth: 28 }
      saveRecurringInvestment(input)

      const stored = JSON.parse(mockLocalStorage[RECURRING_STORAGE_KEY])
      expect(stored).toHaveLength(2)
      expect(stored[0].bondId).toBe('1')
      expect(stored[1].bondId).toBe('2')
    })

    it('should handle month-end dates (28, 29, 30, 31)', () => {
      const monthEndDays = [28, 29, 30, 31]
      monthEndDays.forEach((day) => {
        const plan = saveRecurringInvestment({ bondId: '1', amount: 100, dayOfMonth: day })
        expect(plan.dayOfMonth).toBe(day)
      })
    })

    it('should handle dayOfMonth boundary values (1 and 31)', () => {
      const plan1 = saveRecurringInvestment({ bondId: '1', amount: 100, dayOfMonth: 1 })
      expect(plan1.dayOfMonth).toBe(1)

      const plan31 = saveRecurringInvestment({ bondId: '1', amount: 100, dayOfMonth: 31 })
      expect(plan31.dayOfMonth).toBe(31)
    })

    it('should dispatch RECURRING_CHANGED_EVENT after save', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      saveRecurringInvestment({ bondId: '1', amount: 100, dayOfMonth: 15 })
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: RECURRING_CHANGED_EVENT }),
      )
    })

    it('should return the plan even in SSR context (window undefined)', () => {
      const originalWindow = global.window
      // @ts-expect-error - testing SSR
      delete global.window
      const plan = saveRecurringInvestment({ bondId: '1', amount: 100, dayOfMonth: 15 })
      expect(plan.bondId).toBe('1')
      expect(plan.amount).toBe(100)
      expect(plan.dayOfMonth).toBe(15)
      expect(plan.active).toBe(true)
      global.window = originalWindow
    })

    it('should not persist in SSR context', () => {
      const originalWindow = global.window
      // @ts-expect-error - testing SSR
      delete global.window
      saveRecurringInvestment({ bondId: '1', amount: 100, dayOfMonth: 15 })
      // Nothing should be in storage
      expect(mockLocalStorage[RECURRING_STORAGE_KEY]).toBeUndefined()
      global.window = originalWindow
    })
  })

  describe('DST and timezone edge cases', () => {
    it('should handle dates created during DST transition', () => {
      // March 10, 2024 2:00 AM (DST starts in US)
      const dstStart = new Date('2024-03-10T02:00:00')
      vi.useFakeTimers()
      vi.setSystemTime(dstStart)

      const plan = saveRecurringInvestment({ bondId: '1', amount: 100, dayOfMonth: 10 })
      expect(plan.dayOfMonth).toBe(10)
      expect(plan.createdAt).toBeTruthy()

      vi.useRealTimers()
    })

    it('should handle dates created during DST end', () => {
      // November 3, 2024 2:00 AM (DST ends in US)
      const dstEnd = new Date('2024-11-03T02:00:00')
      vi.useFakeTimers()
      vi.setSystemTime(dstEnd)

      const plan = saveRecurringInvestment({ bondId: '1', amount: 100, dayOfMonth: 3 })
      expect(plan.dayOfMonth).toBe(3)
      expect(plan.createdAt).toBeTruthy()

      vi.useRealTimers()
    })
  })

  describe('writeRecurringInvestments - server merge scenario', () => {
    it('should completely replace local plans with server copy', () => {
      const localPlans: RecurringInvestmentPlan[] = [
        {
          bondId: 'local-1',
          amount: 100,
          dayOfMonth: 15,
          createdAt: '2024-01-01T00:00:00Z',
          active: true,
        },
      ]
      mockLocalStorage[RECURRING_STORAGE_KEY] = JSON.stringify(localPlans)

      const serverPlans: RecurringInvestmentPlan[] = [
        {
          bondId: 'server-1',
          amount: 200,
          dayOfMonth: 20,
          createdAt: '2024-02-01T00:00:00Z',
          active: true,
        },
        {
          bondId: 'server-2',
          amount: 300,
          dayOfMonth: 25,
          createdAt: '2024-02-02T00:00:00Z',
          active: false,
        },
      ]
      writeRecurringInvestments(serverPlans)

      const stored = JSON.parse(mockLocalStorage[RECURRING_STORAGE_KEY])
      expect(stored).toEqual(serverPlans)
      expect(stored).toHaveLength(2)
    })
  })
})
