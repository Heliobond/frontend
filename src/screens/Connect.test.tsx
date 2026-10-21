import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/render'
import { Connect } from './Connect'

const mockWallet = {
  connectionError: null as string | null,
  connecting: false,
  syncing: false,
  retry: vi.fn(),
}

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => mockWallet,
}))

describe('Connect screen - Wallet syncing indicator (#473)', () => {
  beforeEach(() => {
    mockWallet.connectionError = null
    mockWallet.connecting = false
    mockWallet.syncing = false
    mockWallet.retry.mockClear()
  })

  it('renders connect doors without syncing indicator when idle', () => {
    render(<Connect onWallet={vi.fn()} onNew={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.queryByTestId('wallet-syncing-indicator')).toBeNull()
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument()
  })

  it('displays syncing indicator and loading state when syncing with Stellar', () => {
    mockWallet.connecting = true
    mockWallet.syncing = true

    render(<Connect onWallet={vi.fn()} onNew={vi.fn()} onCancel={vi.fn()} />)

    const indicator = screen.getByTestId('wallet-syncing-indicator')
    expect(indicator).toBeInTheDocument()
    expect(indicator).toHaveTextContent(/syncing with stellar/i)

    const button = screen.getByRole('button', { name: /syncing…/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Connect screen - demo door (#866)', () => {
  it('labels the demo path as a demo and runs it on click', () => {
    const onNew = vi.fn()
    render(<Connect onWallet={vi.fn()} onNew={onNew} onCancel={vi.fn()} />)

    expect(screen.getByRole('heading', { name: "I'm new — try the demo" })).toBeInTheDocument()
    screen.getByRole('button', { name: 'Try the demo' }).click()
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('does not promise wallet creation or in-app funding', () => {
    render(<Connect onWallet={vi.fn()} onNew={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.queryByText(/create a secure wallet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/add funds/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Email')).not.toBeInTheDocument()
    expect(screen.queryByText('Passkey')).not.toBeInTheDocument()
  })
})
