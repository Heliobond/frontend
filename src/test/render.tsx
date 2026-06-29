/**
 * Shared render helper that wraps components in the providers the app uses:
 * next-intl (i18n) and ThemeProvider. Import this instead of the bare
 * @testing-library/react render so component tests get a realistic context.
 */
import { render, type RenderOptions } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { ThemeProvider } from '@/theme/ThemeProvider'
import type { ReactNode } from 'react'
import en from '../../messages/en.json'

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <ThemeProvider>{children}</ThemeProvider>
    </NextIntlClientProvider>
  )
}

function renderWithProviders(ui: ReactNode, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export * from '@testing-library/react'
export { renderWithProviders as render }
