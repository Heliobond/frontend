'use client'

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { reportError } from '../lib/errorReporting'
import { type Locale, RTL_LOCALES } from './config'
import { getMessageFallback, withEnglishFallback } from './fallback'
import { loadMessages, type Messages } from './loadMessages'

export type { Messages } from './loadMessages'

function onClientMessageError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] ${message}`)
  }
  reportError(error instanceof Error ? error : new Error(message), {
    kind: 'render',
    context: { i18n: message },
  })
}

interface LocaleSwitcherValue {
  locale: Locale
  dir: 'ltr' | 'rtl'
  switchLocale: (target: Locale) => Promise<'applied' | 'failed' | 'superseded'>
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
  const [messages, setMessages] = useState(() => withEnglishFallback(initialMessages))
  const latestRequest = useRef(0)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = getDir(locale)
  }, [locale])

  const switchLocale: LocaleSwitcherValue['switchLocale'] = useCallback(
    async (target) => {
      const request = ++latestRequest.current
      let catalog: Messages
      try {
        catalog = withEnglishFallback(await loadMessages(target))
      } catch {
        return request === latestRequest.current ? 'failed' : 'superseded'
      }
      if (request !== latestRequest.current) return 'superseded'

      document.cookie = `NEXT_LOCALE=${target};path=/;max-age=31536000;samesite=lax`
      startTransition(() => {
        setLocale(target)
        setMessages(catalog)
        router.refresh()
      })
      return 'applied'
    },
    [router],
  )

  const value = useMemo(
    () => ({ locale, dir: getDir(locale), switchLocale }),
    [locale, switchLocale],
  )

  return (
    <LocaleSwitcherContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        onError={onClientMessageError}
        getMessageFallback={getMessageFallback}
      >
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
