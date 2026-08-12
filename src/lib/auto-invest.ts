
/**
 * Auto-invest / recurrence helpers (issue #301).
 * Computes the next run date and projects accumulation for a recurring
 * bond purchase plan.
 */
export type RecurrenceInterval = "weekly" | "monthly";

export interface RecurringPlan {
  bondId: string;
  amount: number;
  interval: RecurrenceInterval;
  startDate: string;
}

export function nextRunDate(
  interval: RecurrenceInterval,
  from: Date = new Date(),
): Date {
  const next = new Date(from.getTime());
  if (interval === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

export function estimateAccumulation(
  plan: RecurringPlan,
  months: number,
  annualYieldPct: number,
): number {
  const periodsPerYear = plan.interval === "weekly" ? 52 : 12;
  const totalPeriods = Math.round(months * (periodsPerYear / 12));
  const ratePerPeriod = annualYieldPct / 100 / periodsPerYear;
  if (totalPeriods <= 0) return 0;
  if (ratePerPeriod === 0) return plan.amount * totalPeriods;
  const factor =
    (Math.pow(1 + ratePerPeriod, totalPeriods) - 1) / ratePerPeriod;
  return plan.amount * factor;
}

export function isValidPlan(plan: RecurringPlan): boolean {
  return plan.amount > 0 && (plan.interval === "weekly" || plan.interval === "monthly");
}
