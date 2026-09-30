// Unit tests for yield alerts module

import { describe, it, expect, beforeEach } from 'vitest'
import {
  readAlerts,
  writeAlerts,
  getEffectiveYield,
  evaluateAlerts,
  updateAlertStates,
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
        { id: '1', bondId: 1, bondName: 'Test', threshold: 5, operator: 'above', createdAt: '2024-01-01' },
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

    // #638 — edge-triggered: equal value falls to 'below' state (strict > check).
    // On first evaluation, when yield equals threshold and operator is 'below',
    // the alert fires once because equal-value state matches the target 'below'
    // state. This is intentional — the user set a 'below X' alert and yield is
    // at-or-below X, so they want to know about it.
    it('should trigger on first evaluation when yield equals threshold (below)', () => {
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
      expect(triggered).toHaveLength(1)
      expect(triggered[0].alert.id).toBe('alert-1')
      expect(triggered[0].currentYield).toBe(35)
    })

    // #638 — should NOT re-fire when state hasn't crossed (no edge).
    // If lastState was 'above' (alert fired last time) and current state is still
    // 'above' (yield still above threshold), the alert must not fire again.
    it('should not re-fire when state has not crossed (lastState === currentState)', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 65,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
          lastState: 'above', // already on the target side — no crossing
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(0)
    })

    // #638 — should fire on crossing: state flips from 'below' to 'above'
    // (operator='above') for an alert whose lastState was 'below'.
    it('should fire when state crosses from below to above', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 65,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
          lastState: 'below', // was below last time, now above — crossing!
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(1)
    })

    // #638 — cooldown is no longer used (edge-triggered, not level-triggered).
    // If lastState is undefined (first evaluation), and yield is already above
    // threshold, the alert fires once. This replaces the old 60-second cooldown
    // test which no longer reflects the contract.
    it('should fire once on first evaluation when yield is already on target side', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 65,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
          // lastState undefined → first evaluation
        },
      ]
      const triggered = evaluateAlerts(alerts, mockProjects)
      expect(triggered).toHaveLength(1)
    })

    // #638 — lastTriggeredAt is no longer a cooldown gate; lastState is what
    // determines whether the next evaluation fires. Here lastState is 'below'
    // (alert was previously below threshold) and current yield is now above —
    // crossing detected, alert fires. lastTriggeredAt is kept as a record
    // only.
    it('should fire when state crosses, regardless of lastTriggeredAt age', () => {
      const now = new Date()
      const tenSecondsAgo = new Date(now.getTime() - 10_000).toISOString()

      const alerts: YieldAlert[] = [
        {
          id: 'alert-1',
          bondId: 1,
          bondName: 'Test Bond',
          threshold: 65,
          operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
          lastTriggeredAt: tenSecondsAgo, // very recent — but cooldown is gone
          lastState: 'below',            // — crossing detected
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

  describe('updateAlertStates', () => {
    const mockProjects: Project[] = [
      { id: 1, credit: 80, green: 60 } as Project, // effective yield: 70
      { id: 2, credit: 40, green: 30 } as Project, // effective yield: 35
    ]

    it('returns the same array length as input', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1', bondId: 1, bondName: 'A', threshold: 65, operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'alert-2', bondId: 2, bondName: 'B', threshold: 40, operator: 'below',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const updated = updateAlertStates(alerts, mockProjects)
      expect(updated).toHaveLength(2)
    })

    it('sets lastState to "above" when yield is above threshold', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1', bondId: 1, bondName: 'A', threshold: 65, operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const updated = updateAlertStates(alerts, mockProjects)
      expect(updated[0].lastState).toBe('above')
    })

    it('sets lastState to "below" when yield is below threshold', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1', bondId: 2, bondName: 'B', threshold: 40, operator: 'below',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const updated = updateAlertStates(alerts, mockProjects)
      expect(updated[0].lastState).toBe('below')
    })

    it('sets lastState to "below" when yield equals threshold (strict > check)', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1', bondId: 1, bondName: 'A', threshold: 70, operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      // yield 70, threshold 70 → 70 > 70 false → 'below'
      const updated = updateAlertStates(alerts, mockProjects)
      expect(updated[0].lastState).toBe('below')
    })

    it('preserves all other fields on the alert (id, threshold, operator, etc.)', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1', bondId: 1, bondName: 'A', threshold: 65, operator: 'above',
          createdAt: '2024-01-01T00:00:00Z', lastTriggeredAt: '2024-09-30T00:00:00Z',
        },
      ]
      const updated = updateAlertStates(alerts, mockProjects)
      expect(updated[0].id).toBe('alert-1')
      expect(updated[0].bondId).toBe(1)
      expect(updated[0].bondName).toBe('A')
      expect(updated[0].threshold).toBe(65)
      expect(updated[0].operator).toBe('above')
      expect(updated[0].createdAt).toBe('2024-01-01T00:00:00Z')
      expect(updated[0].lastTriggeredAt).toBe('2024-09-30T00:00:00Z')
      expect(updated[0].lastState).toBe('above')
    })

    it('returns alert unchanged when project is not found (skips lastState)', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1', bondId: 999, bondName: 'Ghost', threshold: 65, operator: 'above',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      const updated = updateAlertStates(alerts, mockProjects)
      expect(updated[0].lastState).toBeUndefined()
      expect(updated[0].id).toBe('alert-1')
    })

    it('overwrites existing lastState on subsequent calls', () => {
      const alerts: YieldAlert[] = [
        {
          id: 'alert-1', bondId: 1, bondName: 'A', threshold: 65, operator: 'above',
          createdAt: '2024-01-01T00:00:00Z', lastState: 'below',
        },
      ]
      const updated = updateAlertStates(alerts, mockProjects)
      expect(updated[0].lastState).toBe('above') // 70 > 65 → 'above'
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
