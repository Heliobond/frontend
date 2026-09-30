'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  getAlerts,
  getServerAlerts,
  setAlerts as commitAlerts,
  subscribeAlerts,
  evaluateAlerts,
  generateAlertId,
  type YieldAlert,
  type AlertOperator,
} from '../lib/yieldAlerts'
import { useToast } from '../components/Toast'
import { selectProjects } from '../state/selectors'
import { useRemoteSync } from '../session/useRemoteSync'

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
 * Holds the yield alert state and mirrors it to localStorage. The list is read
 * through an external store, so the first client render already matches the
 * server HTML and no hydration pass is needed. Evaluates alerts on mount and
 * every 60s, firing toasts for triggered ones.
 */
export function YieldAlertProvider({ children }: { children: ReactNode }) {
  const alerts = useSyncExternalStore(subscribeAlerts, getAlerts, getServerAlerts)
  const { toast } = useToast()
  // Read by callbacks and the interval below, which must not re-subscribe
  // whenever the list changes. Kept in sync after commit instead of during render.
  const alertsRef = useRef(alerts)

  // Persist + commit helper.
  const commit = useCallback((next: YieldAlert[]) => {
    alertsRef.current = next
    commitAlerts(next)
  }, [])

  // Mirror list changes that came from outside this component (another tab, a
  // storage repair) so the callbacks and the evaluator below read current data.
  useEffect(() => {
    alertsRef.current = alerts
  }, [alerts])

  // Sync across devices once the wallet session is signed in (#603). Alerts are
  // merged by id so one created while signed out is kept.
  useRemoteSync<YieldAlert[]>({
    resource: 'alerts',
    value: alerts,
    apply: commit,
    merge: (local, remote) => {
      const byId = new Map<string, YieldAlert>()
      for (const alert of Array.isArray(remote) ? remote : []) byId.set(alert.id, alert)
      for (const alert of local) if (!byId.has(alert.id)) byId.set(alert.id, alert)
      return [...byId.values()]
    },
  })

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
          a.id === alertId ? { ...a, threshold, operator, lastTriggeredAt: undefined } : a,
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
