import { describe, it, expect, vi, beforeEach } from '@/test/bun'
import { render, screen, act, waitFor } from '@testing-library/react'
import type { Messages } from './LocaleProvider'
import fr from '../../messages/fr.json'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const { LocaleProvider, useLocaleSwitcher } = await import('./LocaleProvider')
const catalog = await import('./loadMessages')

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
  document.cookie = 'NEXT_LOCALE=en;path=/'
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
      expect(document.documentElement.dir).toBe('rtl')
      expect(document.documentElement.lang).toBe('ar')
    })
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

  it('ignores an older catalog that resolves after the latest language choice', async () => {
    const french = Promise.withResolvers<Messages>()
    const started = Promise.withResolvers<void>()
    const loadMessages = catalog.loadMessages
    const load = vi.spyOn(catalog, 'loadMessages').mockImplementation((locale) => {
      if (locale !== 'fr') return loadMessages(locale)
      started.resolve()
      return french.promise
    })

    try {
      render(
        <LocaleProvider initialLocale="en" initialMessages={EMPTY_MESSAGES}>
          <TestChild />
        </LocaleProvider>,
      )

      screen.getByText('switch-to-fr').click()
      await started.promise
      expect(document.cookie).toContain('NEXT_LOCALE=en')
      screen.getByText('switch-to-ar').click()
      await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('ar'))
      await act(async () => french.resolve(fr))

      expect(screen.getByTestId('locale')).toHaveTextContent('ar')
      expect(document.documentElement.dir).toBe('rtl')
      expect(document.documentElement.lang).toBe('ar')
      expect(document.cookie).toContain('NEXT_LOCALE=ar')
      expect(mockRefresh).toHaveBeenCalledTimes(1)
    } finally {
      load.mockRestore()
    }
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
