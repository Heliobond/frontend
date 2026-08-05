import type { Metadata, Viewport } from 'next'
import { getLocale, getMessages } from 'next-intl/server'
import { Providers } from './providers'
import { LocaleProvider, type Messages } from '../i18n/LocaleProvider'
import { type Locale } from '../i18n/request'
import { TopBar } from '../shell/TopBar'
import { Footer } from '../shell/Footer'
import { THEME_SCRIPT } from '../theme/themeScript'
import '../styles/index.css'

export const metadata: Metadata = {
  title: 'Heliobond — sunlight made financial',
  description:
    'Own a piece of the energy transition. From one dollar. A transparent pool funding verified green projects on Stellar.',
  icons: {
    icon: '/assets/favicon.svg',
    apple: '/assets/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Heliobond — sunlight made financial',
    description:
      'Own a piece of the energy transition. From one dollar. A transparent pool funding verified green projects on Stellar.',
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <LocaleProvider initialLocale={locale as Locale} initialMessages={messages as Messages}>
          <Providers>
            <a href="#main-content" className="hb-skip-link">
              Skip to content
            </a>
            <TopBar />
            {children}
            <Footer />
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  )
}
