'use client'

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { type Locale, RTL_LOCALES } from './config'

export type Messages = typeof en

interface LocaleSwitcherValue {
  locale: Locale
  dir: 'ltr' | 'rtl'
  switchLocale: (target: Locale) => void
}

const LocaleSwitcherContext = createContext<LocaleSwitcherValue | null>(null)

function getDir(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'
}

export function LocaleProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: Locale
  initialMessages: Messages
  children: ReactNode
}) {
  const router = useRouter()
  const [locale, setLocale] = useState(initialLocale)
  const [messages, setMessages] = useState(initialMessages)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = getDir(locale)
  }, [locale])

  const switchLocale = useCallback(
    (target: Locale) => {
      document.cookie = `NEXT_LOCALE=${target};path=/;max-age=31536000;samesite=lax`

      import(`../../messages/${target}.json`).then((mod) => {
        startTransition(() => {
          setLocale(target)
          setMessages(mod.default)
          router.refresh()
        })
      })
    },
    [router],
  )

  const value = useMemo(
    () => ({ locale, dir: getDir(locale), switchLocale }),
    [locale, switchLocale],
  )

  return (
    <LocaleSwitcherContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LocaleSwitcherContext.Provider>
  )
}

export function useLocaleSwitcher() {
  const value = useContext(LocaleSwitcherContext)
  if (!value) {
    throw new Error('useLocaleSwitcher must be used within LocaleProvider')
  }
  return value
}
