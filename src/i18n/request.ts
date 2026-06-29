import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

// Heliobond launches native in English and French (per the brief). Locale is
// chosen by a cookie (set by the in-app language switcher); no [locale] URL
// segment, so existing routes are untouched.
export const LOCALES = ['en', 'fr'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export const LOCALE_LABELS: Record<Locale, string> = { en: 'EN', fr: 'FR' }

export default getRequestConfig(async () => {
  const store = await cookies()
  const cookieLocale = store.get('NEXT_LOCALE')?.value
  const locale: Locale = LOCALES.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : DEFAULT_LOCALE

  const messages = (await import(`../../messages/${locale}.json`)).default
  return { locale, messages }
})
