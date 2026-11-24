import { getLocaleCode } from './format'

/** USD amounts are entered to whole cents. */
const MAX_FRACTION_DIGITS = 2

/** One compiled grammar per locale — Intl lookups are too slow to repeat per keystroke. */
const grammarCache = new Map<string, RegExp>()
const separatorCache = new Map<string, { group: string; decimal: string }>()

const ARABIC_INDIC_ZERO = 0x0660
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0

/**
 * Converts Arabic-Indic digits (U+0660–0669, U+06F0–06F9) to ASCII digits and
 * the Arabic decimal (U+066B) and thousands (U+066C) separators to the locale's
 * Latin-digit separators, so one grammar validates every input form.
 */
function normalizeNativeDigits(value: string, separators: { group: string; decimal: string }): string {
  return value
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[\u06f0-\u06f9]/g, (ch) => String(ch.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/\u066b/g, separators.decimal)
    .replace(/\u066c/g, separators.group)
}

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
  separatorCache.set(localeCode, { group, decimal })
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
  const localeCode = getLocaleCode(locale)
  const grammar = moneyGrammar(localeCode)
  const normalized = normalizeNativeDigits(value.trim(), separatorCache.get(localeCode)!)
  const match = grammar.exec(normalized)
  if (!match) return null
  const [, integer, fraction = ''] = match
  return Number(`${integer.replace(/\D/g, '')}.${fraction}`)
}
