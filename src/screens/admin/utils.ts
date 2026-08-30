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
