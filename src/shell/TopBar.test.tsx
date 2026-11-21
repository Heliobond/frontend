import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@/test/render'
import { TopBar } from './TopBar'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh }),
}))

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => ({
    connected: false,
    address: null,
    connecting: false,
    isDemo: false,
    disconnect: vi.fn(),
  }),
  shortAddress: (address: string) => address,
}))

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

describe('TopBar preferences menu', () => {
  beforeEach(() => {
    localStorage.removeItem('hb-theme')
    document.cookie = 'NEXT_LOCALE=en;path=/'
    refresh.mockClear()
  })

  const openMenu = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    return screen.findByRole('menu')
  }

  it('announces a stored dark preference and lets users return to System', async () => {
    localStorage.setItem('hb-theme', 'dark')

    render(<TopBar />)
    await openMenu()
    const themes = within(screen.getByRole('group', { name: 'Theme' }))
    const dark = themes.getByRole('menuitemradio', { name: 'Dark' })
    const system = themes.getByRole('menuitemradio', { name: 'System' })
    expect(dark).toHaveAttribute('aria-checked', 'true')
    expect(system).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(system)
    expect(system).toHaveAttribute('aria-checked', 'true')
    expect(dark).toHaveAttribute('aria-checked', 'false')
    expect(localStorage.getItem('hb-theme')).toBeNull()

    const light = themes.getByRole('menuitemradio', { name: 'Light' })
    fireEvent.click(light)
    expect(light).toHaveAttribute('aria-checked', 'true')
    expect(system).toHaveAttribute('aria-checked', 'false')
    expect(localStorage.getItem('hb-theme')).toBe('light')
  })

  it('keeps the last working language selected after a load failure and lets users retry', async () => {
    vi.doMock('../../messages/fr.json', () => Promise.reject(new Error('Chunk unavailable')))

    try {
      render(<TopBar />)
      const menu = await openMenu()
      const french = within(menu).getByRole('menuitemradio', { name: 'Français' })
      const english = within(menu).getByRole('menuitemradio', { name: 'English' })

      fireEvent.click(french)
      expect(
        await screen.findByText('Could not load that language. Please try again.'),
      ).toBeInTheDocument()
      expect(english).toHaveAttribute('aria-checked', 'true')
      expect(document.cookie).toContain('NEXT_LOCALE=en')
      expect(refresh).not.toHaveBeenCalled()

      vi.doUnmock('../../messages/fr.json')
      fireEvent.click(french)
      await waitFor(() => expect(document.documentElement.lang).toBe('fr'))
      expect(document.cookie).toContain('NEXT_LOCALE=fr')
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).toBeNull()
    } finally {
      vi.doUnmock('../../messages/fr.json')
    }
  })

  it('moves focus with the arrow keys and closes on Escape', async () => {
    render(<TopBar />)
    const menu = await openMenu()
    const items = within(menu).getAllByRole('menuitemradio')

    await waitFor(() => expect(items[0]).toHaveFocus())
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(items[items.length - 1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Preferences' })).toHaveFocus()
  })
})

describe('TopBar mobile navigation (#714)', () => {
  it('opens the mobile menu with all primary destinations and closes on Escape', () => {
    render(<TopBar />)
    const menu = screen.getByRole('button', { name: 'Open site menu' })
    fireEvent.click(menu)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    for (const label of ['explore', 'how', 'learn', 'creator']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(menu).toHaveFocus()
  })
})
