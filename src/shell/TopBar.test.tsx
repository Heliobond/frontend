import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@/test/render'
import { TopBar } from './TopBar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
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
  beforeEach(() => localStorage.removeItem('hb-theme'))

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

describe('TopBar mobile navigation (#714, #1074)', () => {
  it('opens the mobile navigation disclosure with all primary destinations and closes on Escape', () => {
    render(<TopBar />)
    const toggle = screen.getByRole('button', { name: 'Open site menu' })
    fireEvent.click(toggle)

    const nav = screen.getByRole('navigation', { name: 'Open site menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Ordinary links in Tab order, not a menu that would owe arrow-key handling.
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    for (const label of ['explore', 'how', 'learn', 'creator']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Open site menu' })).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })

  it('closes the preferences popup on Escape first and keeps the site navigation open', () => {
    render(<TopBar />)
    const toggle = screen.getByRole('button', { name: 'Open site menu' })
    fireEvent.click(toggle)
    const nav = screen.getByRole('navigation', { name: 'Open site menu' })

    fireEvent.click(within(nav).getByRole('button', { name: 'Preferences' }))
    const popup = within(nav).getByRole('menu')
    fireEvent.keyDown(popup, { key: 'Escape' })

    expect(within(nav).queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Open site menu' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Preferences' })).toHaveFocus()

    // A second Escape, with no popup open, then dismisses the navigation.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Open site menu' })).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })
})
