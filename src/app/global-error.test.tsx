/**
 * Regression tests for #710: an error thrown by the root layout shell (TopBar,
 * a provider) must render the branded `global-error` page and report itself with
 * `kind: 'root'` — previously it fell through to the unbranded Next default with
 * no reporting at all.
 */
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/render'

const health = vi.hoisted(() => ({ isOnline: true, throwError: false }))

vi.mock('@/hooks/useHorizonHealth', () => ({
  useHorizonHealth: () => {
    if (health.throwError) throw new Error('TopBar shell failed')
    return { isOnline: health.isOnline }
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}))

vi.mock('@/wallet/WalletProvider', () => ({
  useWallet: () => ({
    connected: false,
    address: null,
    connecting: false,
    syncing: false,
    restoring: false,
    isDemo: false,
    networkMismatch: false,
    walletNetworkPassphrase: null,
    disconnect: vi.fn(),
    checkWalletNetwork: vi.fn(),
  }),
  shortAddress: (address: string) => address,
}))

vi.mock('@/lib/errorReporting', () => ({ reportError: vi.fn() }))

import { TopBar } from '@/shell/TopBar'
import GlobalError from './global-error'
import { reportError } from '@/lib/errorReporting'

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

/** Mirrors the root `error.tsx`/`global-error.tsx` swap Next.js performs. */
class ShellBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <GlobalError error={this.state.error} reset={vi.fn()} />
    }
    return this.props.children
  }
}

describe('global error boundary (#710)', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    health.isOnline = true
    health.throwError = false
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders the branded global-error page when TopBar throws', () => {
    health.throwError = true // a failing health provider takes down the shell

    render(
      <ShellBoundary>
        <TopBar />
      </ShellBoundary>,
    )

    expect(screen.getByText('Heliobond hit an unexpected error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })

  it('reports a shell crash with kind root', () => {
    health.throwError = true

    render(
      <ShellBoundary>
        <TopBar />
      </ShellBoundary>,
    )

    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ kind: 'root' }),
    )
  })

  it('recovers through reset', () => {
    const reset = vi.fn()
    render(<GlobalError error={new Error('boom')} reset={reset} />)
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(reset).toHaveBeenCalledOnce()
  })
})
