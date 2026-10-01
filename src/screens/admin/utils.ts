/**
 * Clamps a score value (string) between 0 and 100 as an integer.
 */
export function clampScore(v: string): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/**
 * Parses a funded amount string (e.g. "$1,180,000" or ",234,567") into a number.
 */
export function parseFundedNum(s: string): number {
  const n = Number(s.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Validates score inputs (credit and green scores must be between 0 and 100) (#414).
 */
export function validateScores(credit: string, green: string): boolean {
  if (credit === '' || green === '') return false
  const creditN = Number(credit)
  const greenN = Number(green)
  return creditN >= 0 && creditN <= 100 && greenN >= 0 && greenN <= 100
}

/**
 * Checks a single score string is a plausible 0–100 value (moved from
 * OracleForms so both write paths share one validator, #693).
 */
export function isSafeScore(value: string): boolean {
  const n = Number(value)
  return /^\d*\.?\d+$/.test(value) && Number.isFinite(n) && n >= 0 && n <= 100
}

/**
 * Strict integer score check for the inline registry editor (#693):
 * whole numbers from 0 to 100 only — rejects empties, decimals like 72.5,
 * and out-of-range values like 150 or -1 instead of clamping them silently.
 */
export function isValidScoreInput(value: string): boolean {
  return /^\d+$/.test(value) && isSafeScore(value)
}
