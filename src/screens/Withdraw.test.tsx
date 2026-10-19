import { render as rtlRender, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'
import en from '../../messages/en.json'
import { submitWithdraw } from '../wallet/vault'
import { Withdraw } from './Withdraw'
import type { ReactNode } from 'react'

const FULL_TX_HASH = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
const EXPLORER_URL = `https://stellar.expert/explorer/testnet/tx/${FULL_TX_HASH}`

const mockPortfolioState = {
  portfolio: {
    shares: 1000,
    usdcValue: 1000,
    claimableYield: 0,
    shareOfPoolBps: 100,
    totalDeposited: 1000,
  },
  you: {
    value: 1000,
    deltaAbs: 0,
    deltaPct: 0,
    hbs: 1000,
    poolSharePct: 1,
    weightedGreen: 80,
    backed: 6,
  },
  vaultLiquidity: {
    liquid: 200,
    total: 10000,
  },
  activity: [],
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
  claimableYield: 0,
}

const mockVaultLimitsState = {
  paused: false,
  minDeposit: 100,
  minWithdrawShares: 100,
  maxTx: 100000,
  lockExpiresAt: 0,
  utilizationBps: 0,
  loading: false,
  error: null as string | null,
}

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => ({
    address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
    sign: vi.fn(),
    isDemo: false,
    connected: true,
  }),
}))

vi.mock('../wallet/useVault', () => ({
  useVault: () => ({
    sharePrice: 1,
    totalAssets: 10000,
    loading: false,
    error: null,
    fetchedAt: new Date(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../wallet/useVaultLimits', () => ({
  useVaultLimits: () => mockVaultLimitsState,
}))

vi.mock('../hooks/usePortfolio', () => ({
  usePortfolio: () => mockPortfolioState,
}))

vi.mock('../wallet/vault', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../wallet/vault')>()
  return {
    ...actual,
    submitWithdraw: vi.fn(),
    estimateTransactionFee: vi.fn().mockResolvedValue(0.00001),
  }
})

vi.mock('../components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('../components', async () => {
  const React = await import('react')
  const { AddressChip } = await import('../components/AddressChip')
  return {
    AddressChip,
    AmountInput: ({
      value,
      onChange,
      label,
      balance,
      balanceLabel,
      chips,
      cap,
    }: {
      value: string
      onChange: (value: string) => void
      label: string
      balance?: string
      balanceLabel?: string
      chips?: number[]
      cap?: number
    }) =>
      React.createElement(
        'div',
        null,
        React.createElement('input', {
          'aria-label': label,
          value,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
        }),
        balance != null &&
          React.createElement(
            'span',
            { 'data-testid': 'balance-line' },
            `${balanceLabel} ${balance} USDC`,
          ),
        chips?.map((c) =>
          React.createElement(
            'button',
            { key: c, type: 'button', onClick: () => onChange(String(c)) },
            c,
          ),
        ),
        cap != null &&
          React.createElement(
            'button',
            { key: 'max', type: 'button', onClick: () => onChange(String(cap)) },
            'Max',
          ),
      ),
    Button: ({
      children,
      disabled,
      reason,
      onClick,
    }: {
      children: React.ReactNode
      disabled?: boolean
      reason?: string
      onClick?: () => void
    }) => React.createElement('button', { disabled, title: reason, onClick }, children),
    LiquidityMeter: ({ liquid, total }: { liquid?: number; total?: number }) =>
      React.createElement(
        'div',
        { 'data-testid': 'liquidity-meter' },
        `Available to withdraw now: $${liquid} / $${total}`,
      ),
    useToast: () => ({ toast: vi.fn() }),
  }
})

function render(ui: ReactNode) {
  return rtlRender(
    <LocaleProvider initialLocale="en" initialMessages={en}>
      <ThemeProvider>{ui}</ThemeProvider>
    </LocaleProvider>,
  )
}

function mockClipboard() {
  const writeText = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

describe('Withdraw', () => {
  beforeEach(() => {
    vi.mocked(submitWithdraw).mockResolvedValue({
      hash: FULL_TX_HASH,
      queued: false,
      toString: () => FULL_TX_HASH,
    })
    mockPortfolioState.portfolio = {
      shares: 1000,
      usdcValue: 1000,
      claimableYield: 0,
      shareOfPoolBps: 100,
      totalDeposited: 1000,
    }
    mockPortfolioState.you.value = 1000
    mockPortfolioState.vaultLiquidity.liquid = 200
    mockPortfolioState.vaultLiquidity.total = 10000
    mockPortfolioState.loading = false
    mockPortfolioState.error = null
    mockVaultLimitsState.paused = false
    mockVaultLimitsState.maxTx = 100000
    mockVaultLimitsState.utilizationBps = 0
    mockVaultLimitsState.loading = false
    mockVaultLimitsState.error = null
  })

  test('shows a compact transaction chip on success while preserving full hash actions', async () => {
    const writeText = mockClipboard()
    const onDone = vi.fn()

    render(<Withdraw onDone={onDone} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw $150' }))

    await expect(
      screen.findByRole('heading', { name: 'Withdrawal settled' }),
    ).resolves.toBeVisible()

    expect(screen.queryByText(FULL_TX_HASH)).not.toBeInTheDocument()
    expect(screen.getByText('abcdef…567890')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'View transaction hash on Stellar Expert' }),
    ).toHaveAttribute('href', EXPLORER_URL)

    fireEvent.click(screen.getByRole('button', { name: 'Copy transaction hash' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(FULL_TX_HASH)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Back to portfolio' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test('shows liquidity warning before submit when amount exceeds liquid balance', async () => {
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '300' } })

    expect(
      screen.getByText(/Requested amount exceeds immediately available liquid balance/),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Enqueue withdrawal for $300.00' })).toBeEnabled()
  })

  test('renders queued state and owed amount without inventing a position', async () => {
    vi.mocked(submitWithdraw).mockResolvedValue({
      hash: FULL_TX_HASH,
      queued: true,
      estimatedAmount: 300,
      toString: () => FULL_TX_HASH,
    })

    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enqueue withdrawal for $300.00' }))

    await expect(screen.findByRole('heading', { name: 'Withdrawal queued' })).resolves.toBeVisible()

    expect(screen.getByText('Queued — owed amount $300.00 USDC')).toBeVisible()
    expect(screen.getByText('abcdef…567890')).toBeVisible()
  })

  test('shows the connected wallet position as Your value instead of maxTx limit (#699)', () => {
    mockPortfolioState.portfolio.usdcValue = 750
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    const balanceLine = screen.getByTestId('balance-line')
    expect(balanceLine).toHaveTextContent('Your value 750.00 USDC')
    expect(screen.queryByText(/100000\.00 USDC/)).not.toBeInTheDocument()
  })

  test('blocks amounts larger than the user position with a clear reason before signing (#699)', () => {
    mockPortfolioState.portfolio.usdcValue = 500
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '600' } })

    const submitBtn = screen.getByRole('button', { name: /^Withdraw/ })
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveAttribute('title', 'Amount exceeds your position')
  })

  test('generates percentage quick chips based on position that the user can actually withdraw (#699)', () => {
    mockPortfolioState.portfolio.usdcValue = 1000
    mockPortfolioState.vaultLiquidity.liquid = 200
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    // Percentage chips for $1000 position with min 100 USDC: 25% (250), 50% (500), 100% (1000)
    expect(screen.getByRole('button', { name: '250' })).toBeVisible()
    expect(screen.getByRole('button', { name: '500' })).toBeVisible()
    expect(screen.getByRole('button', { name: '1000' })).toBeVisible()

    // Clicking a quick chip selects an amount the user can actually withdraw
    fireEvent.click(screen.getByRole('button', { name: '250' }))
    expect(screen.getByLabelText('Amount')).toHaveValue('250')
    expect(screen.getByRole('button', { name: 'Enqueue withdrawal for $250.00' })).toBeEnabled()

    // Clicking Max selects the immediate liquid cap (200)
    fireEvent.click(screen.getByRole('button', { name: 'Max' }))
    expect(screen.getByLabelText('Amount')).toHaveValue('200')
    expect(screen.getByRole('button', { name: 'Withdraw $200' })).toBeEnabled()
  })

  test('enforces graduated tier limits when pool utilization is high (#699)', () => {
    mockPortfolioState.portfolio.usdcValue = 1000
    mockPortfolioState.vaultLiquidity.liquid = 200
    // At 75% utilization, tier limit is 25% of liquid (25% of 200 = 50 USDC)
    mockVaultLimitsState.utilizationBps = 7500

    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    // Requesting 60 exceeds the graduated tier limit (50 USDC)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '60' } })

    expect(
      screen.getByText(/Amount exceeds maximum graduated tier limit \(\$50\.00\)/),
    ).toBeVisible()
    const submitBtn = screen.getByRole('button', { name: /^Withdraw/ })
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveAttribute('title', 'Amount exceeds graduated tier limit')

    // Queue warning should NOT appear because amounts above tier limit are rejected, not queued
    expect(
      screen.queryByText(/Requested amount exceeds immediately available liquid balance/),
    ).not.toBeInTheDocument()
  })

  test('does not show queue warning when amount exceeds user position (#699)', () => {
    mockPortfolioState.portfolio.usdcValue = 150
    mockPortfolioState.vaultLiquidity.liquid = 100

    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    // 250 is > liquid (100), but also > position (150)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '250' } })

    expect(
      screen.queryByText(/Requested amount exceeds immediately available liquid balance/),
    ).not.toBeInTheDocument()
    const submitBtn = screen.getByRole('button', { name: /^Withdraw/ })
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveAttribute('title', 'Amount exceeds your position')
  })

  test('blocks withdrawal until the connected wallet position has loaded', () => {
    mockPortfolioState.portfolio = null as never
    mockPortfolioState.loading = true
    mockPortfolioState.you.value = 1000 // demo fixture must not be used as live balance

    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    expect(screen.getByTestId('balance-line')).toHaveTextContent('Your value — USDC')
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '150' } })
    expect(screen.getByRole('button', { name: /^Withdraw/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Withdraw/ })).toHaveAttribute(
      'title',
      'Loading your wallet position',
    )
  })

  test('blocks withdrawal when vault limits are loading or could not be fetched', () => {
    mockVaultLimitsState.loading = true
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '150' } })
    expect(screen.getByRole('button', { name: /^Withdraw/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Withdraw/ })).toHaveAttribute(
      'title',
      'Loading vault limits',
    )

    cleanup()
    mockVaultLimitsState.loading = false
    mockVaultLimitsState.error = 'RPC unavailable'
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '150' } })
    expect(screen.getByRole('button', { name: /^Withdraw/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Withdraw/ })).toHaveAttribute(
      'title',
      'Could not verify vault limits',
    )
  })

  test('describes maxTx as the pool transaction limit', () => {
    mockVaultLimitsState.maxTx = 150
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '175' } })
    expect(
      screen.getByText(/Amount exceeds maximum pool transaction limit \(\$150\.00\)/),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Withdraw/ })).toHaveAttribute(
      'title',
      'Amount exceeds pool transaction limit',
    )
  })
})
