import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeProvider'

let systemIsDark = false
let systemListener: ((event: MediaQueryListEvent) => void) | undefined

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
        matches: systemIsDark,
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

    act(() => systemListener?.({ matches: true } as MediaQueryListEvent))
    expect(screen.getByLabelText('Current theme')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Set dark' }))
    act(() => systemListener?.({ matches: false } as MediaQueryListEvent))
    expect(screen.getByLabelText('Current theme')).toHaveTextContent('dark')
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
  })

  it('does not render an inline style element', () => {
    const { container } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(container.querySelector('style')).toBeNull()
  })
})
