// Unit tests for yield alerts module

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readAlerts,
  writeAlerts,
  getAlerts,
  getServerAlerts,
  setAlerts,
  subscribeAlerts,
  getEffectiveYield,
  evaluateAlerts,
  generateAlertId,
  type YieldAlert,
  YIELD_ALERTS_STORAGE_KEY,
} from './yieldAlerts'
import type { Project } from '../data'

describe('yieldAlerts', () => {
  // Mock localStorage
  const mockLocalStorage: { [key: string]: string } = {}

  beforeEach(() => {
    // Reset localStorage mock
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key])

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
  })

  describe('readAlerts', () => {
    it('should return empty array when storage is empty', () => {
      const alerts = readAlerts()
      expect(alerts).toEqual([])
    })

    it('should return empty array when storage contains invalid JSON', () => {
      mockLocalStorage[YIELD_ALERTS_STORAGE_KEY] = 'invalid json{'
      const alerts = readAlerts()
      expect(alerts).toEqual([])
    })

    it('should return empty array when stored value is not an array', () => {
      mockLocalStorage[YIELD_ALERTS_STORAGE_KEY] = JSON.stringify({ notAnArray: true })
      const alerts = readAlerts()
      expect(alerts).toEqual([])
    })

    it('should filter out invalid alert objects', () => {
      const stored = [
        {
          id: '1',
          bondId: 1,
          bondName: 'Test',
          threshold: 5,
          operator: 'above',
          createdAt: '2024-01-01',
        },
        { invalid: 'object' }, // missing required fields
        { id: '2', bondId: 2, threshold: 3, operator: 'below', createdAt: '2024-01-02' }, // missing bondName (optional)
      ]
      mockLocalStorage[YIELD_ALERTS_STORAGE_KEY] = JSON.stringify(stored)
      const alerts = readAlerts()
      expect(alerts).toHaveLength(2)
      expect(alerts[0].id).toBe('1')
      expect(alerts[1].id).toBe('2')
    })

    it('should parse valid alerts correctly', () => {
      const stored: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 42,
          bondName: 'Sokoto Solar',
          threshold: 5.5,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      mockLocalStorage[YIELD_ALERTS_STORAGE_KEY] = JSON.stringify(stored)
      const alerts = readAlerts()
      expect(alerts).toEqual(stored)
    })

    it('should return empty array in SSR context (window undefined)', () => {
      const originalWindow = global.window
      // @ts-expect-error - testing SSR
      delete global.window
      const alerts = readAlerts()
      expect(alerts).toEqual([])
      global.window = originalWindow
    })
  })

  describe('writeAlerts', () => {
    it('should persist alerts to localStorage', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 6,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      writeAlerts(alerts)
      expect(mockLocalStorage[YIELD_ALERTS_STORAGE_KEY]).toBe(JSON.stringify(alerts))
    })

    it('should handle write errors gracefully (no-op)', () => {
      global.localStorage.setItem = () => {
        throw new Error('Storage full')
      }
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 6,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      // Should not throw
      expect(() => writeAlerts(alerts)).not.toThrow()
    })

    it('should no-op in SSR context (window undefined)', () => {
      const originalWindow = global.window
      // @ts-expect-error - testing SSR
      delete global.window
      const alerts: YieldAlert[] = []
      expect(() => writeAlerts(alerts)).not.toThrow()
      global.window = originalWindow
    })
  })

  describe('getEffectiveYield', () => {
    it('should calculate yield as average of credit and green scores', () => {
      const project = { credit: 80, green: 60 } as Project
      expect(getEffectiveYield(project)).toBe(70)
    })

    it('should handle zero scores', () => {
      const project = { credit: 0, green: 0 } as Project
      expect(getEffectiveYield(project)).toBe(0)
    })

    it('should handle equal scores', () => {
      const project = { credit: 50, green: 50 } as Project
      expect(getEffectiveYield(project)).toBe(50)
    })

    it('should handle decimal results correctly', () => {
      const project = { credit: 75, green: 80 } as Project
      expect(getEffectiveYield(project)).toBe(77.5)
    })
  })

  describe('evaluateAlerts', () => {
    const mockProjects: Project[] = [
      { id: 1, credit: 80, green: 60 } as Project, // effective yield: 70
      { id: 2, credit: 40, green: 30 } as Project, // effective yield: 35
      { id: 3, credit: 90, green: 95 } as Project, // effective yield: 92.5
    ]

    it('should trigger "above" alert when yield exceeds threshold', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 65,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(1)
      expect(triggered[0].alert.id).toBe('alert-1')
      expect(triggered[0].currentYield).toBe(70)
    })

    it('should trigger "below" alert when yield falls below threshold', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 2,
          bondName: 'Test Bond',
          threshold: 40,
          operator: 'below',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(1)
      expect(triggered[0].alert.id).toBe('alert-1')
      expect(triggered[0].currentYield).toBe(35)
    })

    it('should not trigger when threshold is exactly equal (above)', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 70,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(0)
    })

    it('should not trigger when threshold is exactly equal (below)', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 2,
          bondName: 'Test Bond',
          threshold: 35,
          operator: 'below',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(0)
    })

    it('should apply 60-second cooldown and not re-trigger', () => {
      const now = new Date()
      const thirtySecondsAgo = new Date(now.getTime() - 30_000).toISOString()

      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 65,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
          lastTriggeredAt: thirtySecondsAgo,
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(0)
    })

    it('should trigger after cooldown period (60+ seconds)', () => {
      const now = new Date()
      const seventySecondsAgo = new Date(now.getTime() - 70_000).toISOString()

      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 65,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
          lastTriggeredAt: seventySecondsAgo,
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(1)
    })

    it('should skip alerts for projects that do not exist', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 999, // non-existent
          bondName: 'Ghost Bond',
          threshold: 50,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(0)
    })

    it('should evaluate multiple alerts and return all triggered ones', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Bond 1',
          threshold: 65,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'alert-2',
          bondId: 2,
          bondName: 'Bond 2',
          threshold: 40,
          operator: 'below',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'alert-3',
          bondId: 3,
          bondName: 'Bond 3',
          threshold: 95,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(2)
      expect(triggered.map((t) => t.alert.id)).toEqual(['alert-1', 'alert-2'])
    })
  })

  describe('alerts store', () => {
    const alert = (id: string): YieldAlert => ({
      id,
      bondId: 1,
      bondName: 'Sokoto Solar',
      threshold: 5,
      operator: 'above',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    it('reports no alerts on the server so hydration matches', () => {
      expect(getServerAlerts()).toEqual([])
    })

    it('notifies subscribers when the list is replaced', () => {
      const listener = vi.fn()
      const unsubscribe = subscribeAlerts(listener)
      setAlerts([alert('a')])
      expect(listener).toHaveBeenCalledTimes(1)
      expect(getAlerts()).toHaveLength(1)
      unsubscribe()
    })

    it('persists a replaced list to storage', () => {
      const unsubscribe = subscribeAlerts(() => {})
      setAlerts([alert('a')])
      expect(readAlerts().map((a) => a.id)).toEqual(['a'])
      unsubscribe()
    })

    it('keeps the snapshot referentially stable between writes', () => {
      const unsubscribe = subscribeAlerts(() => {})
      const first = getAlerts()
      expect(getAlerts()).toBe(first)
      unsubscribe()
    })

    it('reads the stored list on first subscribe', () => {
      writeAlerts([alert('stored')])
      const unsubscribe = subscribeAlerts(() => {})
      expect(getAlerts().map((a) => a.id)).toEqual(['stored'])
      unsubscribe()
    })

    it('picks up a change made in another tab', () => {
      const listener = vi.fn()
      const unsubscribe = subscribeAlerts(listener)
      writeAlerts([alert('remote')])
      window.dispatchEvent(new StorageEvent('storage', { key: YIELD_ALERTS_STORAGE_KEY }))
      expect(listener).toHaveBeenCalled()
      expect(getAlerts().map((a) => a.id)).toEqual(['remote'])
      unsubscribe()
    })

    it('ignores storage events for unrelated keys', () => {
      const listener = vi.fn()
      const unsubscribe = subscribeAlerts(listener)
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-key' }))
      expect(listener).not.toHaveBeenCalled()
      unsubscribe()
    })

    it('stops notifying after unsubscribe', () => {
      const listener = vi.fn()
      const unsubscribe = subscribeAlerts(listener)
      unsubscribe()
      setAlerts([alert('a')])
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('generateAlertId', () => {
    it('should generate a unique string id', () => {
      const id1 = generateAlertId()
      const id2 = generateAlertId()
      expect(typeof id1).toBe('string')
      expect(typeof id2).toBe('string')
      expect(id1).not.toBe(id2)
    })

    it('should generate ids with consistent format', () => {
      const id = generateAlertId()
      // Should be base36 string (random part + timestamp)
      expect(id.length).toBeGreaterThan(0)
      expect(/^[a-z0-9]+$/.test(id)).toBe(true)
    })
  })
})
