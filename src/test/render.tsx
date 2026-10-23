/**
 * Shared render helper that wraps components in the providers the app uses:
 * next-intl (i18n) and ThemeProvider. Import this instead of the bare
 * @testing-library/react render so component tests get a realistic context.
 */
import { render, type RenderOptions } from '@testing-library/react'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import type { Locale } from '@/i18n/config'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/components'
import { WatchlistProvider } from '@/watchlist/WatchlistProvider'
import type { ReactNode } from 'react'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import es from '../../messages/es.json'
import ar from '../../messages/ar.json'
import pt from '../../messages/pt.json'

const catalogs = { en, fr, es, ar, pt }

function AllProviders({ children, locale }: { children: ReactNode; locale: Locale }) {
  return (
    <LocaleProvider initialLocale={locale} initialMessages={catalogs[locale]}>
      <ThemeProvider>
        <ToastProvider>
          <WatchlistProvider>{children}</WatchlistProvider>
        </ToastProvider>
      </ThemeProvider>
    </LocaleProvider>
  )
}

function renderWithProviders(
  ui: ReactNode,
  options?: Omit<RenderOptions, 'wrapper'> & { locale?: Locale },
) {
  const { locale = 'en', ...renderOptions } = options ?? {}
  return render(ui, {
    wrapper: ({ children }) => <AllProviders locale={locale}>{children}</AllProviders>,
    ...renderOptions,
  })
}

export * from '@testing-library/react'
export { renderWithProviders as render }
