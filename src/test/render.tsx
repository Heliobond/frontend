/**
 * Shared render helper that wraps components in the providers the app uses:
 * next-intl (i18n) and ThemeProvider. Import this instead of the bare
 * @testing-library/react render so component tests get a realistic context.
 */
import { render, type RenderOptions } from '@testing-library/react'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'
import type { ReactNode } from 'react'
import en from '../../messages/en.json'

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider initialLocale="en" initialMessages={en}>
      <ThemeProvider>{children}</ThemeProvider>
    </LocaleProvider>
  )
}

function renderWithProviders(ui: ReactNode, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export * from '@testing-library/react'
export { renderWithProviders as render }
