import { getLocaleCode } from './format'

/** USD amounts are entered to whole cents. */
const MAX_FRACTION_DIGITS = 2

/** One compiled grammar per locale — Intl lookups are too slow to repeat per keystroke. */
const grammarCache = new Map<string, RegExp>()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds the strict grammar for a money amount in `localeCode`: either plain
 * digits or digits grouped in threes with the locale's group separator, then an
 * optional fraction after the locale's decimal separator. Separators come from
 * CLDR via Intl (Latin digits), so `1,5` is a decimal in `fr` but malformed in
 * `en`. Space-like group separators (fr: U+202F) accept any typed space.
 */
function moneyGrammar(localeCode: string): RegExp {
  const cached = grammarCache.get(localeCode)
  if (cached) return cached

  const parts = new Intl.NumberFormat(localeCode, { numberingSystem: 'latn' }).formatToParts(
    11111.1,
  )
  const group = parts.find((part) => part.type === 'group')?.value ?? ','
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.'
  const groupPattern = /\s/.test(group) ? '\\s' : escapeRegExp(group)

  const grammar = new RegExp(
    `^(\\d{1,3}(?:${groupPattern}\\d{3})+|\\d+)(?:${escapeRegExp(decimal)}(\\d{1,${MAX_FRACTION_DIGITS}}))?$`,
  )
  grammarCache.set(localeCode, grammar)
  return grammar
}

/**
 * Parses a user-typed money amount using the separators of the app locale
 * (`en`, `fr`, `es`, `ar`, `pt`). Returns `null` for empty or ambiguous input
 * — exponents, stray characters, misplaced group separators, more than two
 * decimals — instead of silently rewriting what the user typed (#869).
 *
 * O(n) time in the input length; O(1) space beyond the per-locale grammar cache.
 */
export function parseMoneyInput(value: string, locale: string): number | null {
  const match = moneyGrammar(getLocaleCode(locale)).exec(value.trim())
  if (!match) return null
  const [, integer, fraction = ''] = match
  return Number(`${integer.replace(/\D/g, '')}.${fraction}`)
}
