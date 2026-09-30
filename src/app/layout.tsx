import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { getLocale, getMessages } from 'next-intl/server'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Providers } from './providers'
import { fontVariables } from '../theme/fonts'
import { LocaleProvider, type Messages } from '../i18n/LocaleProvider'
import { type Locale, RTL_LOCALES } from '../i18n/config'
import { THEME_SCRIPT } from '../theme/themeScript'
import { CANONICAL_ORIGIN, TITLE_TEMPLATE } from '../lib/routeMetadata'
import '../styles/index.css'

const TopBar = dynamic(() => import('../shell/TopBar').then((m) => m.TopBar))
const Footer = dynamic(() => import('../shell/Footer').then((m) => m.Footer))

export const metadata: Metadata = {
  // Resolves the relative OpenGraph / Twitter image and icon paths below into
  // absolute URLs, using the same origin as robots.txt and sitemap.xml (#656).
  metadataBase: new URL(CANONICAL_ORIGIN),
  // Child segments contribute only their page title; the template appends the
  // brand, so no route has to repeat "| Heliobond" by hand (#657).
  title: {
    default: 'Heliobond — sunlight made financial',
    template: TITLE_TEMPLATE,
  },
  description:
    'Own a piece of the energy transition. From one dollar. A transparent pool funding verified green projects on Stellar.',
  // Canonical URL for the home page
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/assets/favicon.svg',
    apple: '/assets/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Heliobond — sunlight made financial',
    description:
      'Own a piece of the energy transition. From one dollar. A transparent pool funding verified green projects on Stellar.',
    url: CANONICAL_ORIGIN,
    images: [
      {
        url: '/assets/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Heliobond preview card',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Heliobond — sunlight made financial',
    description:
      'Own a piece of the energy transition. From one dollar. A transparent pool funding verified green projects on Stellar.',
    images: ['/assets/og-image.png'],
  },
}

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
              Skip to content
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
