import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/render'

const mockReplace = vi.fn()
let mockPathname = '/portfolio'
let mockSearch = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

let walletState = { connected: false, restoring: false }

vi.mock('./WalletProvider', () => ({
  useWallet: () => walletState,
}))

import { RequireWallet } from './RequireWallet'

const Protected = () => <div data-testid="protected">balances</div>

describe('RequireWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/portfolio'
    mockSearch = ''
    walletState = { connected: false, restoring: false }
  })

  it('renders the gated content for a connected wallet', () => {
    walletState = { connected: true, restoring: false }
    render(
      <RequireWallet>
        <Protected />
      </RequireWallet>,
    )
    expect(screen.getByTestId('protected')).toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects an unconnected visitor to Connect', () => {
    render(
      <RequireWallet>
        <Protected />
      </RequireWallet>,
    )
    expect(mockReplace).toHaveBeenCalledWith('/connect?next=%2Fportfolio')
  })

  it('never renders the gated content to an unconnected visitor', () => {
    render(
      <RequireWallet>
        <Protected />
      </RequireWallet>,
    )
    // The redirect is asynchronous from the DOM's point of view, so the guard
    // must withhold the content itself rather than rely on the navigation
    // winning the race. Otherwise balances flash before the redirect lands.
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  /**
   * The regression that motivated the `restoring` flag: the wallet session is
   * read back from localStorage inside an effect, so a genuinely connected user
   * looks disconnected on the first render. Redirecting then would eject them
   * from the money routes on every page refresh.
   */
  it('waits for the session to rehydrate before deciding', () => {
    walletState = { connected: false, restoring: true }
    render(
      <RequireWallet>
        <Protected />
      </RequireWallet>,
    )
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('preserves the visitor’s intent, query string included', () => {
    mockPathname = '/withdraw'
    mockSearch = 'amount=250'
    render(
      <RequireWallet>
        <Protected />
      </RequireWallet>,
    )
    expect(mockReplace).toHaveBeenCalledWith(
      `/connect?next=${encodeURIComponent('/withdraw?amount=250')}`,
    )
  })

  it('honours a custom redirect target', () => {
    render(
      <RequireWallet redirectTo="/">
        <Protected />
      </RequireWallet>,
    )
    expect(mockReplace).toHaveBeenCalledWith('/?next=%2Fportfolio')
  })

  it('shows the fallback while the decision is pending', () => {
    walletState = { connected: false, restoring: true }
    render(
      <RequireWallet fallback={<div data-testid="pending">…</div>}>
        <Protected />
      </RequireWallet>,
    )
    expect(screen.getByTestId('pending')).toBeInTheDocument()
  })
})
