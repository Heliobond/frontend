export interface RecurringInvestmentPlan {
  bondId: string
  amount: number
  dayOfMonth: number
  createdAt: string
  active: boolean
}

const STORAGE_KEY = 'heliobond:recurring-investment-plans'

/** Fired on `window` after the saved plans change in this tab. */
export const RECURRING_CHANGED_EVENT = 'hb-recurring-changed'
export const RECURRING_STORAGE_KEY = STORAGE_KEY

/** Replace the saved plans (used when merging in the server copy, #603). */
export function writeRecurringInvestments(plans: RecurringInvestmentPlan[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
    window.dispatchEvent(new Event(RECURRING_CHANGED_EVENT))
  } catch {
    /* storage unavailable — plans just won't persist */
  }
}

export function saveRecurringInvestment(
  plan: Omit<RecurringInvestmentPlan, 'createdAt' | 'active'>,
): RecurringInvestmentPlan {
  const next: RecurringInvestmentPlan = {
    ...plan,
    createdAt: new Date().toISOString(),
    active: true,
  }
  if (typeof window === 'undefined') return next
  const existing = readRecurringInvestments()
  writeRecurringInvestments([...existing, next])
  return next
}

export function readRecurringInvestments(): RecurringInvestmentPlan[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as RecurringInvestmentPlan[]) : []
  } catch {
    return []
  }
}
