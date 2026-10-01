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
 * Checks if a string represents a valid integer score between 0 and 100.
 */
export function isSafeScore(value: string): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return false
  const n = Number(trimmed)
  return Number.isInteger(n) && n >= 0 && n <= 100
}

/**
 * Returns a descriptive error message if score is invalid, or null if valid.
 */
export function getScoreError(value: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Score is required'
  }
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    return 'Score must be an integer between 0 and 100'
  }
  const n = Number(trimmed)
  if (n < 0 || n > 100) {
    return 'Score must be between 0 and 100'
  }
  return null
}

/**
 * Validates score inputs (credit and green scores must be integers between 0 and 100).
 */
export function validateScores(credit: string, green: string): boolean {
  return isSafeScore(credit) && isSafeScore(green)
}
