import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@/test/render'
import { OnChainPosition } from './OnChainPosition'
import * as vault from '../wallet/vault'
import * as toastModule from '../components/Toast'
import { notifyTransactionConfirmed } from '../wallet/vaultEvents'

const mockToast = vi.fn()
vi.mock('../components/Toast', async (importOriginal) => {
  const actual = await importOriginal<typeof toastModule>()
  return {
    ...actual,
    useToast: () => ({ toast: mockToast, dismiss: vi.fn() }),
  }
})

const mockWallet = {
  address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
  isDemo: false,
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
    submitClaimYield: vi.fn(),
  }
})

describe('OnChainPosition - Claim yield flow (#590)', () => {
  beforeEach(() => {
    vi.stubEnv(
      'NEXT_PUBLIC_VAULT_CONTRACT_ID',
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    )
    // useVaultRefresh subscribes to live vault events; keep the stream offline.
    vi.stubEnv('NEXT_PUBLIC_WS_URL', '')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    mockToast.mockClear()
    mockWallet.sign.mockClear()
    vi.mocked(vault.fetchPortfolio).mockReset()
    vi.mocked(vault.submitClaimYield).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('renders nothing when vault contract id is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', '')
    render(<OnChainPosition />)
    expect(screen.queryByTestId('onchain-position')).toBeNull()
  })

  it('displays claimable yield and hides the Claim button when claimable yield is 0', async () => {
    vi.mocked(vault.fetchPortfolio).mockResolvedValue({
      shares: 100,
      usdcValue: 102.5,
      claimableYield: 0,
      shareOfPoolBps: 50,
      totalDeposited: 100,
    })

    render(<OnChainPosition />)

    await waitFor(() => {
      expect(screen.getByTestId('onchain-claimable-yield')).toHaveTextContent('$0.00')
    })
    expect(screen.queryByRole('button', { name: /claim yield/i })).toBeNull()
  })

  it('shows Claim button when claimable yield is positive', async () => {
    vi.mocked(vault.fetchPortfolio).mockResolvedValue({
      shares: 100,
      usdcValue: 105.75,
      claimableYield: 5.75,
      shareOfPoolBps: 50,
      totalDeposited: 100,
    })

    render(<OnChainPosition />)

    await waitFor(() => {
      expect(screen.getByTestId('onchain-claimable-yield')).toHaveTextContent('$5.75')
    })
    expect(screen.getByRole('button', { name: /claim yield/i })).toBeInTheDocument()
  })

  it('successfully claims yield, drops displayed value to 0, and triggers explorer toast', async () => {
    vi.mocked(vault.fetchPortfolio)
      .mockResolvedValueOnce({
        shares: 100,
        usdcValue: 105.75,
        claimableYield: 5.75,
        shareOfPoolBps: 50,
        totalDeposited: 100,
      })
      .mockResolvedValueOnce({
        shares: 100,
        usdcValue: 100,
        claimableYield: 0,
        shareOfPoolBps: 50,
        totalDeposited: 100,
      })

    const fakeHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    // Like the real submitClaimYield, announce the confirmed transaction so
    // useVaultRefresh reloads the position (#605).
    vi.mocked(vault.submitClaimYield).mockImplementation(async () => {
      notifyTransactionConfirmed(fakeHash, 'claim_yield')
      return fakeHash
    })

    render(<OnChainPosition />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /claim yield/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /claim yield/i }))

    await waitFor(() => {
      expect(vault.submitClaimYield).toHaveBeenCalledWith(mockWallet.address, mockWallet.sign)
    })

    // Displayed value drops to 0
    await waitFor(() => {
      expect(screen.getByTestId('onchain-claimable-yield')).toHaveTextContent('$0.00')
    })

    // Explorer toast called
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'success',
        title: 'Yield claimed',
        href: expect.stringContaining(fakeHash),
      }),
    )

    // Balances refreshed after confirmation
    await waitFor(() => expect(vault.fetchPortfolio).toHaveBeenCalledTimes(2))
  })

  it('displays failure state with retry button when claim fails', async () => {
    vi.mocked(vault.fetchPortfolio).mockResolvedValue({
      shares: 100,
      usdcValue: 105.75,
      claimableYield: 5.75,
      shareOfPoolBps: 50,
      totalDeposited: 100,
    })
    vi.mocked(vault.submitClaimYield).mockRejectedValue(new Error('Network error on chain'))

    render(<OnChainPosition />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /claim yield/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /claim yield/i }))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'error',
          title: 'Claim failed',
          message: 'Network error on chain',
        }),
      )
    })
  })
})
