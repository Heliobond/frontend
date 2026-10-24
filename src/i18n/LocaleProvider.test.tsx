import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { LocaleProvider, useLocaleSwitcher, type Messages } from './LocaleProvider'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const EMPTY_MESSAGES = {} as Messages

function TestChild() {
  const { locale, dir, switchLocale } = useLocaleSwitcher()
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="dir">{dir}</span>
      <button onClick={() => switchLocale('ar')}>switch-to-ar</button>
      <button onClick={() => switchLocale('fr')}>switch-to-fr</button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  document.documentElement.lang = 'en'
  document.documentElement.dir = 'ltr'
})

describe('LocaleProvider', () => {
  it('renders with initial locale and direction', () => {
    render(
      <LocaleProvider initialLocale="en" initialMessages={EMPTY_MESSAGES}>
        <TestChild />
      </LocaleProvider>,
    )
    expect(screen.getByTestId('locale')).toHaveTextContent('en')
    expect(screen.getByTestId('dir')).toHaveTextContent('ltr')
  })

  it('switches to Arabic and sets document.documentElement.dir to rtl (#890)', async () => {
    render(
      <LocaleProvider initialLocale="en" initialMessages={EMPTY_MESSAGES}>
        <TestChild />
      </LocaleProvider>,
    )

    await act(async () => {
      screen.getByText('switch-to-ar').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('ar')
    })
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
  })

  it('calls router.refresh() after switching locale (#890)', async () => {
    render(
      <LocaleProvider initialLocale="en" initialMessages={EMPTY_MESSAGES}>
        <TestChild />
      </LocaleProvider>,
    )

    await act(async () => {
      screen.getByText('switch-to-fr').click()
    })

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
    expect(document.cookie).toContain('NEXT_LOCALE=fr')
  })

  it('loads target catalog lazily via dynamic import (#889)', async () => {
    render(
      <LocaleProvider initialLocale="en" initialMessages={EMPTY_MESSAGES}>
        <TestChild />
      </LocaleProvider>,
    )

    await act(async () => {
      screen.getByText('switch-to-ar').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('ar')
    })
  })
})
