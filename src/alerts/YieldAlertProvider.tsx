'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  readAlerts,
  writeAlerts,
  evaluateAlerts,
  generateAlertId,
  YIELD_ALERTS_STORAGE_KEY,
  type YieldAlert,
  type AlertOperator,
} from '../lib/yieldAlerts'
import { useToast } from '../components/Toast'
import { selectProjects } from '../state/selectors'

interface YieldAlertContextValue {
  /** All saved alerts, most-recently-added last. */
  alerts: YieldAlert[]
  /** Total number of alerts. */
  count: number
  /** Add a new yield alert. Returns the created alert. */
  add: (bondId: number, bondName: string, threshold: number, operator: AlertOperator) => YieldAlert
  /** Remove an alert by its id. */
  remove: (alertId: string) => void
  /** Update an existing alert's threshold and/or operator. */
  update: (alertId: string, threshold: number, operator: AlertOperator) => void
  /** Get all alerts for a specific bond. */
  getAlertsForBond: (bondId: number) => YieldAlert[]
  /** Check if a bond has any alerts set. */
  hasAlertForBond: (bondId: number) => boolean
}

const YieldAlertContext = createContext<YieldAlertContextValue | null>(null)

export function useYieldAlerts(): YieldAlertContextValue {
  const ctx = useContext(YieldAlertContext)
  if (!ctx) throw new Error('useYieldAlerts must be used within <YieldAlertProvider>')
  return ctx
}

const EVAL_INTERVAL_MS = 60_000

/**
 * Holds the yield alert state and mirrors it to localStorage. Starts empty
 * on the server and first client render to avoid hydration mismatch, then
 * hydrates from storage on mount. Evaluates alerts on mount and every 60s,
 * firing toasts for triggered ones.
 */
export function YieldAlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<YieldAlert[]>([])
  const { toast } = useToast()
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts

  // Hydrate from localStorage on mount + cross-tab sync.
  useEffect(() => {
    setAlerts(readAlerts())

    const syncOtherTabs = (event: StorageEvent) => {
      if (event.key !== YIELD_ALERTS_STORAGE_KEY) return
      setAlerts(readAlerts())
    }
    window.addEventListener('storage', syncOtherTabs)
    return () => window.removeEventListener('storage', syncOtherTabs)
  }, [])

  // Persist + commit helper.
  const commit = useCallback((next: YieldAlert[]) => {
    setAlerts(next)
    writeAlerts(next)
  }, [])

  // Evaluate alerts on mount and at interval.
  useEffect(() => {
    const evaluate = () => {
      const current = alertsRef.current
      if (current.length === 0) return

      const projects = selectProjects()
      const triggered = evaluateAlerts(current, projects)

      if (triggered.length === 0) return

      // Mark triggered alerts with the current timestamp.
      const now = new Date().toISOString()
      const updatedAlerts = current.map((a) => {
        const hit = triggered.find((t) => t.alert.id === a.id)
        if (hit) return { ...a, lastTriggeredAt: now }
        return a
      })
      commit(updatedAlerts)

      // Fire a toast for each triggered alert.
      for (const { alert, currentYield } of triggered) {
        toast({
          tone: 'solar',
          title: '🔔 Yield alert triggered',
          message: `${alert.bondName} yield is ${currentYield.toFixed(1)}% — ${alert.operator === 'above' ? 'above' : 'below'} your ${alert.threshold}% threshold.`,
          duration: 8000,
        })
      }
    }

    // Evaluate once on mount (delayed to let projects load).
    const initialTimeout = setTimeout(evaluate, 2000)
    const interval = setInterval(evaluate, EVAL_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [commit, toast])

  const add = useCallback(
    (bondId: number, bondName: string, threshold: number, operator: AlertOperator): YieldAlert => {
      const newAlert: YieldAlert = {
        id: generateAlertId(),
        bondId,
        bondName,
        threshold,
        operator,
        createdAt: new Date().toISOString(),
      }
      commit([...alertsRef.current, newAlert])
      return newAlert
    },
    [commit],
  )

  const remove = useCallback(
    (alertId: string) => {
      commit(alertsRef.current.filter((a) => a.id !== alertId))
    },
    [commit],
  )

  const update = useCallback(
    (alertId: string, threshold: number, operator: AlertOperator) => {
      commit(
        alertsRef.current.map((a) =>
          a.id === alertId
            ? { ...a, threshold, operator, lastTriggeredAt: undefined }
            : a,
        ),
      )
    },
    [commit],
  )

  const getAlertsForBond = useCallback(
    (bondId: number) => alerts.filter((a) => a.bondId === bondId),
    [alerts],
  )

  const hasAlertForBond = useCallback(
    (bondId: number) => alerts.some((a) => a.bondId === bondId),
    [alerts],
  )

  return (
    <YieldAlertContext.Provider
      value={{
        alerts,
        count: alerts.length,
        add,
        remove,
        update,
        getAlertsForBond,
        hasAlertForBond,
      }}
    >
      {children}
    </YieldAlertContext.Provider>
  )
}
