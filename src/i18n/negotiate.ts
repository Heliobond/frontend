// Locale negotiation helpers shared by the request proxy and unit tests.
// Kept free of Next.js imports so it can run in plain Vitest.
import { DEFAULT_LOCALE, LOCALES, type Locale } from './config'

/**
 * Parses an `Accept-Language` header into ordered `{ lang, quality }` pairs.
 * Tags without an explicit `q` default to `1`. An entry whose `q` parameter is
 * malformed, empty, or outside [0, 1] is dropped entirely rather than falling
 * back to the default weight.
 */
export function parseAcceptLanguage(header: string): { lang: string; quality: number }[] {
  return header
    .split(',')
    .map((part) => {
      const [rawLang, ...params] = part.trim().split(';')
      const lang = rawLang.trim().toLowerCase()
      if (!lang) return null
      let quality = 1
      for (const param of params) {
        const [key, value, ...extra] = param.trim().split('=')
        if (key.trim().toLowerCase() !== 'q') continue
        // Parse the whole token: parseFloat would happily read "0.9junk" as
        // 0.9, letting a malformed entry outrank a valid preference.
        const token = value?.trim() ?? ''
        const parsed =
          extra.length === 0 && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) ? Number(token) : NaN
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null
        quality = parsed
      }
      return { lang, quality }
    })
    .filter((entry): entry is { lang: string; quality: number } => entry !== null)
    .sort((a, b) => b.quality - a.quality)
}

/**
 * Finds the best supported locale for an `Accept-Language` header.
 *
 * Matching order per tag: exact match (`pt-br` never equals `pt`), then the
 * primary subtag (`pt-PT` → `pt`, `fr-CA` → `fr`). Returns the default locale
 * when nothing matches or the header is empty. A wildcard selects a supported
 * locale that has not been explicitly given zero weight.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE
  const tags = parseAcceptLanguage(acceptLanguage)

  for (const { lang, quality } of tags) {
    if (quality <= 0) continue
    if (lang === '*') {
      const excluded = new Set(tags.filter((tag) => tag.quality === 0).map((tag) => tag.lang))
      if (!excluded.has(DEFAULT_LOCALE)) return DEFAULT_LOCALE
      return LOCALES.find((locale) => !excluded.has(locale)) ?? DEFAULT_LOCALE
    }
    const exact = LOCALES.find((locale) => locale === lang)
    if (exact) return exact
    const primary = lang.split('-')[0]
    const partial = LOCALES.find((locale) => locale === primary)
    if (partial) return partial
  }
  return DEFAULT_LOCALE
}

/** Returns true when `value` is one of the supported locales. */
export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value)
}
