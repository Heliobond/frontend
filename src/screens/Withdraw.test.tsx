import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'
import en from '../../messages/en.json'
import { submitWithdraw } from '../wallet/vault'
import { Withdraw } from './Withdraw'
import type { ReactNode } from 'react'

const FULL_TX_HASH = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
const EXPLORER_URL = `https://stellar.expert/explorer/testnet/tx/${FULL_TX_HASH}`

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => ({
    address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
    sign: vi.fn(),
  }),
}))

vi.mock('../hooks/usePortfolio', () => ({
  usePortfolio: () => ({
    you: {
      value: 500,
      deltaAbs: 100,
      deltaPct: 25,
      hbs: 450,
      poolSharePct: 0.1,
      weightedGreen: 90,
      backed: 3,
      riskScore: 20,
      riskLevel: 'conservative' as const,
    },
    portfolio: {
      address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
      shares: 450,
      usdcValue: 500,
      holdings: [],
    },
    claimableYield: 0,
    activity: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

vi.mock('../wallet/useVaultLimits', () => ({
  useVaultLimits: () => ({
    minWithdrawShares: 1,
    paused: false,
    maxTx: 1000,
    lockExpiresAt: 0,
    utilizationBps: 5000,
    loading: false,
  }),
}))

vi.mock('../wallet/useVault', () => ({
  useVault: () => ({
    sharePrice: 1.1,
    totalAssets: 400,
    loading: false,
    error: null,
    refresh: vi.fn(),
    fetchedAt: new Date(),
  }),
}))

vi.mock('../wallet/vault', () => ({
  submitWithdraw: vi.fn(),
  estimateTransactionFee: vi.fn().mockResolvedValue(0.00001),
}))

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
    }: {
      value: string
      onChange: (value: string) => void
      label: string
    }) =>
      React.createElement('input', {
        'aria-label': label,
        value,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
      }),
    Button: ({
      children,
      disabled,
      onClick,
      reason,
    }: {
      children: React.ReactNode
      disabled?: boolean
      onClick?: () => void
      reason?: string
    }) => React.createElement('button', { disabled, onClick, 'data-reason': reason }, children),
    LiquidityMeter: () => React.createElement('div', null, 'Available to withdraw now'),
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

  test('blocks amount larger than user position with clear reason', async () => {
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '600' } })

    const btn = screen.getByRole('button', { name: 'Withdraw' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('data-reason', 'Amount exceeds your position')
  })

  test('does not show queue warning when amount is within liquid balance', async () => {
    render(<Withdraw onDone={vi.fn()} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '150' } })

    expect(
      screen.queryByText(/Requested amount exceeds immediately available liquid balance/),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Withdraw $150' })).toBeEnabled()
  })
})
