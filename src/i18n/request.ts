import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, LOCALES, type Locale } from './config'
import { getMessageFallback, onMessageError, withEnglishFallback } from './fallback'

// Re-export the shared, client-safe constants so existing server-side
// importers (`layout.tsx`) keep working from this module.
export { LOCALES, DEFAULT_LOCALE, LOCALE_LABELS, RTL_LOCALES } from './config'
export type { Locale } from './config'

export default getRequestConfig(async () => {
  const store = await cookies()
  const cookieLocale = store.get('NEXT_LOCALE')?.value
  const locale: Locale = LOCALES.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : DEFAULT_LOCALE

  const messages = withEnglishFallback(
    (await import(`../../messages/${locale}.json`)).default,
  )
  return {
    locale,
    messages,
    onError: onMessageError,
    getMessageFallback,
  }
})
