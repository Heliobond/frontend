import type { Viewport } from 'next'
import { headers } from 'next/headers'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Providers } from './providers'
import { fontVariables } from '../theme/fonts'
import { LocaleProvider, type Messages } from '../i18n/LocaleProvider'
import { type Locale, RTL_LOCALES } from '../i18n/config'
import { THEME_SCRIPT } from '../theme/themeScript'
import { generateMetadata } from '../lib/routeMetadata.server'
import '../styles/index.css'

// Title, description and OG/Twitter tags follow the cookie locale (#902).
export { generateMetadata }

const TopBar = dynamic(() => import('../shell/TopBar').then((m) => m.TopBar))
const Footer = dynamic(() => import('../shell/Footer').then((m) => m.Footer))

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F5F1' },
    { media: '(prefers-color-scheme: dark)', color: '#0D1714' },
  ],
}

/**
 * Root layout (Server Component). Resolves the locale + messages server-side and
 * provides them to the client tree; injects the no-flash theme script; holds the
 * persistent TopBar + Footer shell around the routed page.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  const t = await getTranslations('Shell')
  // Per-request CSP nonce set by src/proxy.ts (#601); the inline theme script needs it.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html
      lang={locale}
      dir={RTL_LOCALES.has(locale as Locale) ? 'rtl' : 'ltr'}
      suppressHydrationWarning
      className={fontVariables}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <LocaleProvider initialLocale={locale as Locale} initialMessages={messages as Messages}>
          <Providers>
            <a href="#main-content" className="hb-skip-link">
              {t('skipToContent')}
            </a>
            <Suspense fallback={null}>
              <TopBar />
            </Suspense>
            {children}
            <Suspense fallback={null}>
              <Footer />
            </Suspense>
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  )
}
