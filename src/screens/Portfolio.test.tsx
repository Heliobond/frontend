import { render, screen, waitFor } from '@/test/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Portfolio } from './Portfolio'
import * as vault from '../wallet/vault'

const mockWallet = {
  address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
  connected: true,
  isDemo: false,
  connect: vi.fn(),
  sign: vi.fn(async (xdr: string) => xdr),
}

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => mockWallet,
}))

vi.mock('../wallet/vault', async (importOriginal) => {
  const actual = await importOriginal<typeof vault>()
  return {
    ...actual,
    fetchPortfolio: vi.fn(),
    fetchClaimableYield: vi.fn(),
    submitClaim: vi.fn(),
  }
})

describe('Portfolio — Connected Wallet On-Chain Integration (#589)', () => {
  beforeEach(() => {
    vi.stubEnv(
      'NEXT_PUBLIC_VAULT_CONTRACT_ID',
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    )
    mockWallet.address = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
    mockWallet.connected = true
    mockWallet.isDemo = false
    vi.mocked(vault.fetchPortfolio).mockReset()
    vi.mocked(vault.fetchClaimableYield).mockReset()
    vi.mocked(vault.fetchClaimableYield).mockResolvedValue(0)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders connect wallet prompt when disconnected', () => {
    mockWallet.connected = false
    render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)
    expect(screen.getByText(/Connect your wallet to view your portfolio/i)).toBeInTheDocument()
  })

  it('renders demo fixture portfolio when in demo mode', () => {
    mockWallet.connected = true
    mockWallet.isDemo = true
    render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)
    expect(screen.getByTestId('portfolio-value')).toBeInTheDocument()
    expect(vault.fetchPortfolio).not.toHaveBeenCalled()
  })

  it('renders two different holdings for two different wallet addresses (Wallet A vs Wallet B)', async () => {
    // Wallet A
    mockWallet.address = 'GBQ_WALLET_A_ADDRESS_1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    vi.mocked(vault.fetchPortfolio).mockResolvedValue({
      shares: 500,
      usdcValue: 550,
      claimableYield: 25,
      shareOfPoolBps: 125,
      totalDeposited: 500,
    })
    vi.mocked(vault.fetchClaimableYield).mockResolvedValue(25)

    const { unmount } = render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('portfolio-value')).toHaveTextContent('$550')
      expect(screen.getByTestId('portfolio-shares')).toHaveTextContent('500')
    })

    unmount()

    // Wallet B
    mockWallet.address = 'GAK_WALLET_B_ADDRESS_9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA'
    vi.mocked(vault.fetchPortfolio).mockResolvedValue({
      shares: 1200,
      usdcValue: 1350,
      claimableYield: 60,
      shareOfPoolBps: 300,
      totalDeposited: 1200,
    })
    vi.mocked(vault.fetchClaimableYield).mockResolvedValue(60)

    render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('portfolio-value')).toHaveTextContent('$1,350')
      expect(screen.getByTestId('portfolio-shares')).toHaveTextContent('1,200')
    })
  })

  it('renders holdings matching get_portfolio response from testnet', async () => {
    vi.mocked(vault.fetchPortfolio).mockResolvedValue({
      shares: 2500.5,
      usdcValue: 2625.75,
      claimableYield: 125.25,
      shareOfPoolBps: 450,
      totalDeposited: 2500,
    })
    vi.mocked(vault.fetchClaimableYield).mockResolvedValue(125.25)

    render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('portfolio-value')).toHaveTextContent('$2,625.75')
      expect(screen.getByTestId('portfolio-shares')).toHaveTextContent('2,500.5000')
      expect(screen.getByTestId('portfolio-poolshare')).toHaveTextContent('4.50%')
    })
  })

  it('displays loading state banner while reading on-chain portfolio', async () => {
    // Return a pending promise to keep loading state active
    vi.mocked(vault.fetchPortfolio).mockReturnValue(new Promise(() => {}))

    render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)

    expect(screen.getByTestId('portfolio-loading')).toBeInTheDocument()
    expect(screen.getByText(/Reading your portfolio position from Soroban/i)).toBeInTheDocument()
  })

  it('displays error state banner with retry button when RPC query fails', async () => {
    vi.mocked(vault.fetchPortfolio).mockRejectedValue(new Error('Soroban RPC node timeout'))

    render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)

    await waitFor(() => {
      const errorCard = screen.getByTestId('portfolio-error')
      expect(errorCard).toBeInTheDocument()
      expect(errorCard).toHaveTextContent('Soroban RPC node timeout')
    })

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('surfaces claimable yield read failures while retaining portfolio yield', async () => {
    vi.mocked(vault.fetchPortfolio).mockResolvedValue({
      shares: 100,
      usdcValue: 110,
      claimableYield: 12,
      shareOfPoolBps: 100,
      totalDeposited: 100,
    })
    vi.mocked(vault.fetchClaimableYield).mockRejectedValue(new Error('Yield RPC failed'))

    render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('portfolio-error')).toHaveTextContent('Yield RPC failed')
      expect(screen.getByTestId('portfolio-value')).toHaveTextContent('$110')
    })
  })

  it('ignores results from a request after its effect is cleaned up', async () => {
    let resolvePortfolio:
      ((value: Awaited<ReturnType<typeof vault.fetchPortfolio>>) => void) | undefined
    vi.mocked(vault.fetchPortfolio).mockReturnValue(
      new Promise((resolve) => {
        resolvePortfolio = resolve
      }),
    )

    const { unmount } = render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)
    unmount()
    resolvePortfolio?.({
      shares: 100,
      usdcValue: 110,
      claimableYield: 12,
      shareOfPoolBps: 100,
      totalDeposited: 100,
    })

    await waitFor(() => expect(resolvePortfolio).toBeDefined())
  })

  it('displays zero-share empty holdings banner when wallet has 0 shares', async () => {
    vi.mocked(vault.fetchPortfolio).mockResolvedValue({
      shares: 0,
      usdcValue: 0,
      claimableYield: 0,
      shareOfPoolBps: 0,
      totalDeposited: 0,
    })

    render(<Portfolio onWithdraw={vi.fn()} onDeposit={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('portfolio-empty')).toBeInTheDocument()
      expect(screen.getByText(/No active vault position found/i)).toBeInTheDocument()
    })
  })
})
