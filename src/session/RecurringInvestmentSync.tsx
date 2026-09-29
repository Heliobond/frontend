'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  RECURRING_CHANGED_EVENT,
  RECURRING_STORAGE_KEY,
  readRecurringInvestments,
  writeRecurringInvestments,
  type RecurringInvestmentPlan,
} from '../lib/recurringInvestments'
import { useRemoteSync } from './useRemoteSync'

const planKey = (plan: RecurringInvestmentPlan) => `${plan.bondId}|${plan.createdAt}`

/** Mirrors recurring-investment plans to the server for a signed-in wallet (#603). */
export function RecurringInvestmentSync() {
  const [plans, setPlans] = useState<RecurringInvestmentPlan[]>([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlans(readRecurringInvestments())
    const reload = () => setPlans(readRecurringInvestments())
    const onStorage = (event: StorageEvent) => {
      if (event.key === RECURRING_STORAGE_KEY) reload()
    }
    window.addEventListener(RECURRING_CHANGED_EVENT, reload)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(RECURRING_CHANGED_EVENT, reload)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const apply = useCallback((next: RecurringInvestmentPlan[]) => {
    setPlans(next)
    writeRecurringInvestments(next)
  }, [])

  useRemoteSync<RecurringInvestmentPlan[]>({
    resource: 'recurring',
    value: plans,
    apply,
    merge: (local, remote) => {
      const byKey = new Map<string, RecurringInvestmentPlan>()
      for (const plan of Array.isArray(remote) ? remote : []) byKey.set(planKey(plan), plan)
      for (const plan of local) if (!byKey.has(planKey(plan))) byKey.set(planKey(plan), plan)
      return [...byKey.values()]
    },
  })

  return null
}
