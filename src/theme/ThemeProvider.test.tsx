import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeProvider'

let systemIsDark = false
let systemListener: ((event: MediaQueryListEvent) => void) | undefined

function changeSystemTheme(matches: boolean) {
  systemIsDark = matches
  act(() => systemListener?.({ matches } as MediaQueryListEvent))
}

function ThemeProbe() {
  const { setTheme, theme, toggle } = useTheme()
  return (
    <>
      <output aria-label="Current theme">{theme}</output>
      <button type="button" onClick={toggle}>
        Toggle
      </button>
      <button type="button" onClick={() => setTheme('dark')}>
        Set dark
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        Set system
      </button>
    </>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    systemIsDark = false
    systemListener = undefined
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        get matches() {
          return systemIsDark
        },
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          systemListener = listener
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hydrates from the pre-paint theme and preserves an explicit choice', async () => {
    const user = userEvent.setup()
    document.documentElement.dataset.theme = 'dark'

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    expect(await screen.findByText('dark')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Toggle' }))

    expect(screen.getByLabelText('Current theme')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('hb-theme')).toBe('light')
  })

  it('follows live system changes until the person chooses a theme', async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    changeSystemTheme(true)
    expect(screen.getByLabelText('Current theme')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Set dark' }))
    changeSystemTheme(false)
    expect(screen.getByLabelText('Current theme')).toHaveTextContent('dark')
  })

  it('clears a stored override and immediately resumes following the system', async () => {
    localStorage.setItem('hb-theme', 'dark')
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    expect(document.documentElement.dataset.theme).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Set system' }))
    expect(localStorage.getItem('hb-theme')).toBeNull()
    expect(screen.getByLabelText('Current theme')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    changeSystemTheme(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('matches browser chrome to an explicit theme and resumes following the OS', async () => {
    const metas = [
      ['light', '#F3F5F1'],
      ['dark', '#0D1714'],
    ].map(([theme, color]) => {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.media = `(prefers-color-scheme: ${theme})`
      meta.content = color
      document.head.append(meta)
      return meta
    })

    try {
      localStorage.setItem('hb-theme', 'dark')
      const user = userEvent.setup()
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      )

      expect(metas.map((meta) => meta.content)).toEqual(['#0D1714', '#0D1714'])
      const oldLight = metas[0]
      metas[0] = oldLight.cloneNode() as HTMLMetaElement
      metas[0].content = '#F3F5F1'
      oldLight.replaceWith(metas[0])
      await waitFor(() => expect(metas[0].content).toBe('#0D1714'))

      await user.click(screen.getByRole('button', { name: 'Set system' }))
      expect(metas.map((meta) => meta.content)).toEqual(['#F3F5F1', '#F3F5F1'])
      changeSystemTheme(true)
      expect(metas.map((meta) => meta.content)).toEqual(['#0D1714', '#0D1714'])
    } finally {
      metas.forEach((meta) => meta.remove())
    }
  })

  it('synchronizes theme changes from another tab', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'hb-theme', newValue: 'dark' }))
    })

    expect(screen.getByLabelText('Current theme')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    changeSystemTheme(false)
    expect(document.documentElement.dataset.theme).toBe('dark')

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'hb-theme', newValue: null }))
    })
    expect(document.documentElement.dataset.theme).toBe('light')
    changeSystemTheme(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('does not render an inline style element (#709)', () => {
    const { container } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(container.querySelector('style')).toBeNull()
  })
})
