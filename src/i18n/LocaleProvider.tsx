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
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { type Locale } from './request'

export type Messages = typeof en

const CATALOGS: Record<Locale, Messages> = { en, fr }

interface LocaleSwitcherValue {
  locale: Locale
  switchLocale: () => void
}

const LocaleSwitcherContext = createContext<LocaleSwitcherValue | null>(null)

export function LocaleProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: Locale
  initialMessages: Messages
  children: ReactNode
}) {
  const [locale, setLocale] = useState(initialLocale)
  const [messages, setMessages] = useState(initialMessages)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const switchLocale = useCallback(() => {
    const next = locale === 'en' ? 'fr' : 'en'
    document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;samesite=lax`

    startTransition(() => {
      setLocale(next)
      setMessages(CATALOGS[next])
    })
  }, [locale])

  const value = useMemo(() => ({ locale, switchLocale }), [locale, switchLocale])

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
