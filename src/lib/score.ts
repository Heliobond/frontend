/**
 * Oracle score presentation helpers.
 *
 * A project that has not been scored yet has no numeric score — it must never
 * inherit a plausible-looking number such as 80. Keep `undefined` as "unknown"
 * all the way to the display layer and give every consumer an explicit fallback.
 */

/** Text shown wherever an unassigned credit or green score would appear. */
export const UNKNOWN_SCORE_LABEL = 'Unavailable'

/** True only for a real, finite score. `0` is a valid score; `undefined` is not. */
export function isKnownScore(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Display form for a score — an unknown score reads as "Unavailable". */
export function formatScore(value: number | undefined | null): string {
  return isKnownScore(value) ? String(value) : UNKNOWN_SCORE_LABEL
}

/**
 * Numeric fallback for the few calculations (yield, risk) that must produce a
 * number. Unknown scores are excluded rather than counted as zero so an
 * unscored project cannot drag a result down.
 */
export function knownScores(...values: (number | undefined | null)[]): number[] {
  return values.filter(isKnownScore)
}
