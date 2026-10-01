import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'
import en from '../../messages/en.json'
import { Deposit } from './Deposit'
import type { ReactNode } from 'react'

const mockBalance = vi.fn()
const mockUseWallet = vi.fn()

vi.mock('../wallet/useUsdcBalance', () => ({
  useUsdcBalance: () => mockBalance(),
}))

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => mockUseWallet(),
}))

vi.mock('../wallet/vault', () => ({
  submitDeposit: vi.fn(),
  estimateTransactionFee: vi.fn().mockResolvedValue(0.00001),
}))

vi.mock('../wallet/useVault', () => ({
  useVault: () => ({
    sharePrice: 1.0,
    loading: false,
    error: null,
    fetchedAt: new Date(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../wallet/useVaultLimits', () => ({
  useVaultLimits: () => ({
    minDeposit: 100,
    minWithdrawShares: 100,
    maxTx: 10000,
    paused: false,
    lockExpiresAt: 0,
    utilizationBps: 0,
    loading: false,
  }),
}))

vi.mock('../state/selectors', () => ({
  selectPoolSummary: () => ({
    projectedRate: 8.5,
    projectsFunded: 12,
  }),
}))

vi.mock('../components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

function render(ui: ReactNode) {
  return rtlRender(
    <LocaleProvider initialLocale="en" initialMessages={en}>
      <ThemeProvider>{ui}</ThemeProvider>
    </LocaleProvider>,
  )
}

describe('Deposit screen live USDC balance (#698)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({
      address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
      sign: vi.fn(),
      isDemo: false,
    })
  })

  test('uses on-chain USDC balance for balance line, Max chip and cap notice', () => {
    mockBalance.mockReturnValue({
      balance: 500,
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    render(<Deposit onDone={vi.fn()} />)

    // Balance line displays real on-chain balance
    expect(screen.getByText(/Balance 500\.00 USDC/i)).toBeInTheDocument()

    // Max chip is present and clicking sets amount to 500
    const maxChip = screen.getByRole('button', { name: 'Max' })
    expect(maxChip).toBeInTheDocument()
    fireEvent.click(maxChip)
    expect(screen.getByLabelText('Amount')).toHaveValue('500')

    // Typing an amount higher than 500 triggers cap notice
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '600' } })
    expect(
      screen.getByText('You hold a balance of $500. You can invest up to this amount today.'),
    ).toBeInTheDocument()
  })

  test('a wallet with less USDC than minDeposit sees "exceeds balance" and cannot proceed', () => {
    mockBalance.mockReturnValue({
      balance: 50,
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    render(<Deposit onDone={vi.fn()} />)

    // Displays wallet balance of 50.00 USDC
    expect(screen.getByText(/Balance 50\.00 USDC/i)).toBeInTheDocument()

    // Default deposit amount is 100, which exceeds 50
    const investButton = screen.getByTitle('Amount exceeds your balance — use Max')
    expect(investButton).toBeInTheDocument()
    expect(investButton).toBeDisabled()

    // Clicking button cannot advance to review
    fireEvent.click(investButton)
    expect(screen.queryByRole('heading', { name: /You're investing/i })).not.toBeInTheDocument()
  })

  test('shows "Balance unavailable" and does not enforce cap when balance is unreadable', () => {
    mockBalance.mockReturnValue({
      balance: null,
      loading: false,
      error: 'Read failed',
      refresh: vi.fn(),
    })

    render(<Deposit onDone={vi.fn()} />)

    // Shows Balance unavailable and no made-up 240 figure
    expect(screen.getByText('Balance unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/240\.00 USDC/)).not.toBeInTheDocument()

    // Max chip is not shown when balance is unavailable
    expect(screen.queryByRole('button', { name: 'Max' })).not.toBeInTheDocument()

    // Amount can exceed 240 without being capped (e.g. 500 USDC)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } })
    const investButton = screen.getByRole('button', { name: 'Invest 500 USDC' })
    expect(investButton).not.toBeDisabled()

    // Advancing to review succeeds
    fireEvent.click(investButton)
    expect(screen.getByRole('heading', { name: /You're investing 500 USDC/i })).toBeInTheDocument()
  })
})
