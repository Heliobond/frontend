import { afterEach, beforeEach, describe, expect, it, vi } from '@/test/bun'

const mockToast = vi.fn()
await vi.mockModule(import.meta.resolve('../components/Toast'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/Toast')>()
  return {
    ...actual,
    useToast: () => ({ toast: mockToast, dismiss: vi.fn() }),
  }
})

const mockWallet = {
  address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
  isDemo: false,
  connected: true,
  sign: vi.fn(async (xdr: string) => xdr),
}

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => mockWallet,
}))

await vi.mockModule(import.meta.resolve('../wallet/vault'), async (importOriginal) => {
  const actual = await importOriginal<typeof vault>()
  return {
    ...actual,
    fetchPortfolio: vi.fn(),
    fetchClaimableYield: vi.fn().mockRejectedValue(new Error('Use snapshot yield')),
    fetchTotalAssets: vi.fn().mockResolvedValue(0),
    fetchUtilizationBps: vi.fn().mockResolvedValue(0),
    fetchVaultLiquidUsdc: vi.fn().mockResolvedValue(0),
    submitClaimYield: vi.fn(),
  }
})

const { act, fireEvent, render, screen, waitFor } = await import('@/test/render')
const { OnChainPosition } = await import('./OnChainPosition')
const { usePortfolio } = await import('../hooks/usePortfolio')
const vault = await import('../wallet/vault')
const { notifyTransactionConfirmed } = await import('../wallet/vaultEvents')
const { vaultEventStream } = await import('../lib/websocket')
const networkConfig = await import('../config/network')
const { TransactionPendingError } = await import('../wallet/transactions')

const portfolio = (shares: number) => ({
  shares,
  usdcValue: shares * 2,
  claimableYield: 1,
  shareOfPoolBps: 100,
  totalDeposited: shares * 2,
})

function PositionHarness() {
  const position = usePortfolio()
  return <OnChainPosition {...position} />
}

describe('OnChainPosition - Claim yield flow and live updates (#590, #605)', () => {
  beforeEach(() => {
    vi.stubEnv(
      'NEXT_PUBLIC_VAULT_CONTRACT_ID',
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    )
    vi.stubEnv('NEXT_PUBLIC_WS_URL', '')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    mockToast.mockClear()
    mockWallet.sign.mockClear()
    vi.mocked(vault.fetchPortfolio).mockReset()
    vi.mocked(vault.submitClaimYield).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('renders nothing when vault contract id is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', '')
    render(<PositionHarness />)
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

    render(<PositionHarness />)

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

    render(<PositionHarness />)

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
    vi.mocked(vault.submitClaimYield).mockImplementation(async () => {
      notifyTransactionConfirmed(fakeHash, 'claim_yield')
      return fakeHash
    })

    render(<PositionHarness />)

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

  it('offers an explorer link for a pending yield claim', async () => {
    const hash = 'a'.repeat(64)
    vi.mocked(vault.fetchPortfolio).mockResolvedValue(portfolio(100))
    vi.mocked(vault.submitClaimYield).mockRejectedValue(new TransactionPendingError(hash))
    render(<PositionHarness />)

    fireEvent.click(await screen.findByRole('button', { name: /claim yield/i }))
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1))

    const notification = mockToast.mock.lastCall?.[0]
    expect(notification).toMatchObject({
      tone: 'solar',
      href: networkConfig.getExplorerTxUrl(hash),
    })
    render(notification.action)
    expect(screen.getByRole('link', { name: /explorer/i })).toHaveAttribute(
      'href',
      networkConfig.getExplorerTxUrl(hash),
    )
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('offers a copyable pending claim hash without a retry when no explorer exists', async () => {
    const hash = 'a'.repeat(64)
    vi.spyOn(networkConfig, 'getExplorerTxUrl').mockReturnValue(undefined)
    vi.spyOn(networkConfig, 'getExplorerUrl').mockReturnValue(undefined)
    vi.mocked(vault.fetchPortfolio).mockResolvedValue(portfolio(100))
    vi.mocked(vault.submitClaimYield).mockRejectedValue(new TransactionPendingError(hash))
    render(<PositionHarness />)

    fireEvent.click(await screen.findByRole('button', { name: /claim yield/i }))
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1))

    const notification = mockToast.mock.lastCall?.[0]
    expect(notification).toMatchObject({ tone: 'solar', href: undefined })
    render(notification.action)
    expect(screen.getByTitle(hash)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy transaction hash' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /explorer/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
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

    render(<PositionHarness />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /claim yield/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /claim yield/i }))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'error',
          title: 'Claim failed',
          message: 'Cannot reach Stellar network — showing cached data.',
        }),
      )
    })
    render(mockToast.mock.lastCall?.[0].action)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('updates personal shares after a confirmed transaction and live vault event', async () => {
    vi.mocked(vault.fetchPortfolio)
      .mockResolvedValueOnce(portfolio(1))
      .mockResolvedValueOnce(portfolio(2))
      .mockResolvedValueOnce(portfolio(3))
    render(<PositionHarness />)
    await waitFor(() => expect(screen.getByTestId('onchain-shares')).toHaveTextContent('1.00'))
    act(() => notifyTransactionConfirmed())
    await waitFor(() => expect(screen.getByTestId('onchain-shares')).toHaveTextContent('2.00'))
    act(() =>
      vaultEventStream.emit({
        type: 'YieldReceived',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      }),
    )
    await waitFor(() => expect(screen.getByTestId('onchain-shares')).toHaveTextContent('3.00'))
  })

  it('defers reads while hidden and refreshes on tab return', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    vi.mocked(vault.fetchPortfolio).mockResolvedValue(portfolio(4))
    render(<PositionHarness />)
    act(() => notifyTransactionConfirmed())
    expect(vault.fetchPortfolio).not.toHaveBeenCalled()
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(screen.getByTestId('onchain-shares')).toHaveTextContent('4.00'))
    expect(vault.fetchPortfolio).toHaveBeenCalledTimes(1)
  })
})
