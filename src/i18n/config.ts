export const LOCALES = ['en', 'fr', 'es', 'ar', 'pt'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'EN',
  fr: 'FR',
  es: 'ES',
  ar: 'AR',
  pt: 'PT',
}

export const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar'] as const)
