/**
 * The real `WalletProvider` behind `RequireWallet`.
 *
 * The gate must hold while a stored session is still unknown, otherwise a
 * refresh on /deposit, /portfolio or /withdraw bounces a connected user to
 * /connect. Regression coverage for the store refactor (#595, #598).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RequireWallet } from './RequireWallet'
import { WalletProvider } from './WalletProvider'

const DEMO = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

const mockReplace = vi.fn()
let mockPathname = '/deposit'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(''),
}))

const Protected = () => <div data-testid="protected">balances</div>

beforeEach(() => {
  mockReplace.mockClear()
  mockPathname = '/deposit'
  localStorage.clear()
})

describe('RequireWallet with the real provider', () => {
  it('does not redirect a user whose stored session is still restoring', async () => {
    localStorage.setItem('hb-address', DEMO)
    localStorage.setItem('hb-wallet', 'demo')

    render(
      <WalletProvider>
        <RequireWallet>
          <Protected />
        </RequireWallet>
      </WalletProvider>,
    )

    // The stored session resolves without ever sending the user to /connect.
    await waitFor(() => expect(screen.getByTestId('protected')).toBeInTheDocument())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects an unconnected visitor to /connect', async () => {
    render(
      <WalletProvider>
        <RequireWallet>
          <Protected />
        </RequireWallet>
      </WalletProvider>,
    )

    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
    expect(mockReplace.mock.calls[0][0]).toContain('/connect?next=%2Fdeposit')
  })

  it('never exposes protected content to an unconnected visitor', async () => {
    render(
      <WalletProvider>
        <RequireWallet fallback={<div data-testid="loading">…</div>}>
          <Protected />
        </RequireWallet>
      </WalletProvider>,
    )

    // Redirected away, and the gated content was never rendered on the way out.
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })
})
