// Heliobond — i18n constants shared by server and client code.
// This module must stay free of server-only imports (`next/headers`,
// `next-intl/server`): LocaleProvider and TopBar are client components and
// import it directly. The server-side request config lives in `request.ts`.

// Locale is chosen by a cookie (set by the in-app language switcher); no
// [locale] URL segment is used, so existing routes are untouched.
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
