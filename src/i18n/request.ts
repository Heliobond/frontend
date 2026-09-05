import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { LOCALES, DEFAULT_LOCALE, type Locale } from './config'

export * from './config'

export default getRequestConfig(async () => {
  const store = await cookies()
  const cookieLocale = store.get('NEXT_LOCALE')?.value
  const locale: Locale = LOCALES.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : DEFAULT_LOCALE

  const messages = (await import(`../../messages/${locale}.json`)).default
  return { locale, messages }
})
