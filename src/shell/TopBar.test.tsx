import { describe, expect, it, vi } from 'vitest'
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
  const openMenu = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    return screen.findByRole('menu')
  }

  it('announces the dark theme as checked', async () => {
    document.documentElement.dataset.theme = 'dark'

    render(<TopBar />)
    await openMenu()

    await waitFor(() => {
      expect(screen.getByRole('menuitemcheckbox', { name: /Switch to light/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })
  })

  it('announces the light theme as not checked', async () => {
    document.documentElement.dataset.theme = 'light'

    render(<TopBar />)
    await openMenu()

    await waitFor(() => {
      expect(screen.getByRole('menuitemcheckbox', { name: /Switch to dark/ })).toHaveAttribute(
        'aria-checked',
        'false',
      )
    })
  })

  it('moves focus with the arrow keys and closes on Escape', async () => {
    render(<TopBar />)
    const menu = await openMenu()
    const items = [
      ...within(menu).queryAllByRole('menuitemcheckbox'),
      ...within(menu).queryAllByRole('menuitemradio'),
    ]

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
