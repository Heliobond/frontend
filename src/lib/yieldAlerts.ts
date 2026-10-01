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

const NO_ALERTS: YieldAlert[] = []

let snapshot: YieldAlert[] = NO_ALERTS
const listeners = new Set<() => void>()

function refresh(): void {
  snapshot = readAlerts()
}

/**
 * Subscribes to the alerts list, including changes made in another tab.
 *
 * The list is exposed as an external store so the provider reads it through
 * `useSyncExternalStore` instead of copying localStorage into state from an
 * effect (#598). The snapshot is cached and only recomputed on write or on a
 * `storage` event, which keeps it referentially stable between renders.
 */
export function subscribeAlerts(listener: () => void): () => void {
  if (!listeners.size) refresh()
  listeners.add(listener)
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorageEvent)
    window.addEventListener('focus', listener)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorageEvent)
      window.removeEventListener('focus', listener)
    }
  }
}

/** Ignores unrelated keys so unrelated storage writes do not churn the list. */
function onStorageEvent(event: StorageEvent): void {
  if (event.key !== null && event.key !== YIELD_ALERTS_STORAGE_KEY) return
  refresh()
  listeners.forEach((listener) => listener())
}

export function getAlerts(): YieldAlert[] {
  return snapshot
}

/** No alerts on the server, so the first client render matches the server HTML. */
export function getServerAlerts(): YieldAlert[] {
  return NO_ALERTS
}

/** Replaces the list and notifies subscribers. */
export function setAlerts(next: YieldAlert[]): void {
  snapshot = next
  writeAlerts(next)
  listeners.forEach((listener) => listener())
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
 * that have crossed their threshold. Applies a 60-second cooldown to
 * avoid spamming the same alert repeatedly.
 */
export function evaluateAlerts(alerts: YieldAlert[], projects: Project[]): TriggeredAlert[] {
  const now = Date.now()
  const COOLDOWN_MS = 60_000

  const triggered: TriggeredAlert[] = []

  for (const alert of alerts) {
    const project = projects.find((p) => p.id === alert.bondId)
    if (!project) continue

    const currentYield = getEffectiveYield(project)

    const crossed =
      alert.operator === 'above' ? currentYield > alert.threshold : currentYield < alert.threshold

    if (!crossed) continue

    // Cooldown: don't re-trigger within 60 seconds.
    if (alert.lastTriggeredAt) {
      const lastFired = new Date(alert.lastTriggeredAt).getTime()
      if (now - lastFired < COOLDOWN_MS) continue
    }

    triggered.push({ alert, currentYield })
  }

  return triggered
}

/** Generate a short, unique id for a new alert. */
export function generateAlertId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
}
