// Yield alerts — lightweight client-side persistence + evaluation for
// threshold-based yield notifications. People set alerts like "notify me
// when Sokoto Solar yield goes above 5%". The list lives in localStorage
// under `hb-yield-alerts` and is mirrored into React state by
// `YieldAlertProvider`.

import { type Project } from '../data'

export const YIELD_ALERTS_STORAGE_KEY = 'hb-yield-alerts'

export type AlertOperator = 'above' | 'below'

export interface YieldAlert {
  /** Unique identifier for this alert. */
  id: string
  /** The bond/project this alert tracks. */
  bondId: number
  /** Human-readable name, shown in toasts and the modal. */
  bondName: string
  /** The threshold percentage value (e.g. 5 means 5%). */
  threshold: number
  /** Whether to trigger when yield goes above or below the threshold. */
  operator: AlertOperator
  /** ISO timestamp of when the alert was created. */
  createdAt: string
  /** ISO timestamp of the last time this alert fired. Undefined if never. */
  lastTriggeredAt?: string
  /** Last observed state: was the yield above or below the threshold? */
  lastState?: 'above' | 'below'
}

export interface TriggeredAlert {
  alert: YieldAlert
  currentYield: number
}

/** Read the saved alerts. Returns [] when storage is empty or unreadable. */
export function readAlerts(): YieldAlert[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(YIELD_ALERTS_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (a): a is YieldAlert =>
        typeof a === 'object' &&
        a !== null &&
        typeof a.id === 'string' &&
        typeof a.bondId === 'number' &&
        typeof a.threshold === 'number',
    )
  } catch {
    return []
  }
}

/** Persist the saved alerts. No-ops when storage is unavailable. */
export function writeAlerts(alerts: YieldAlert[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(YIELD_ALERTS_STORAGE_KEY, JSON.stringify(alerts))
  } catch {
    /* private mode / storage disabled — alerts just won't persist */
  }
}

/**
 * Compute the effective yield for a project based on its oracle scores.
 * Uses `(credit + green) / 2` as a percentage, giving each project a
 * distinct trackable value.
 */
export function getEffectiveYield(project: Pick<Project, 'credit' | 'green'>): number {
  return (project.credit + project.green) / 2
}

/**
 * Evaluate all alerts against current project data. Returns the subset
 * that have just crossed their threshold (edge-triggered, not
 * level-triggered). An alert fires only when the yield moves from one
 * side of the threshold to the other, not on every interval while the
 * condition stays true (#638).
 *
 * The `lastState` field on each alert records which side of the
 * threshold the yield was on the last time we checked. When it flips
 * into the alert's target side, we fire. When it flips back, we clear
 * `lastTriggeredAt` so the alert can fire again on the next crossing.
 */
export function evaluateAlerts(
  alerts: YieldAlert[],
  projects: Project[],
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = []

  for (const alert of alerts) {
    const project = projects.find((p) => p.id === alert.bondId)
    if (!project) continue

    const currentYield = getEffectiveYield(project)
    const currentState: 'above' | 'below' =
      currentYield > alert.threshold ? 'above' : 'below'

    // Edge-triggered: fire only when the state flips into the target side.
    const targetState = alert.operator // 'above' or 'below'
    const justCrossed =
      alert.lastState !== undefined &&
      alert.lastState !== currentState &&
      currentState === targetState

    // First evaluation: if already on the target side, fire once.
    const firstEvaluation = alert.lastState === undefined
    const alreadyOnTarget = currentState === targetState

    if (justCrossed || (firstEvaluation && alreadyOnTarget)) {
      triggered.push({ alert, currentYield })
    }
  }

  return triggered
}

/**
 * Returns updated alerts with their `lastState` field set to the current
 * side of the threshold. Called after `evaluateAlerts` so the next
 * evaluation can detect a crossing.
 */
export function updateAlertStates(
  alerts: YieldAlert[],
  projects: Project[],
): YieldAlert[] {
  return alerts.map((alert) => {
    const project = projects.find((p) => p.id === alert.bondId)
    if (!project) return alert
    const currentYield = getEffectiveYield(project)
    const currentState: 'above' | 'below' =
      currentYield > alert.threshold ? 'above' : 'below'
    return { ...alert, lastState: currentState }
  })
}

/** Generate a short, unique id for a new alert. */
export function generateAlertId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
}
