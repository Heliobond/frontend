import { render, screen, fireEvent } from '@/test/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Deposit } from './Deposit'

const mockWallet = {
  address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
  connected: true,
  isDemo: false,
  connect: vi.fn(),
  sign: vi.fn(async (xdr: string) => xdr),
}

const mockUsdcBalanceState = {
  balance: 5000 as number | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => mockWallet,
}))

vi.mock('../wallet/useUsdcBalance', () => ({
  useUsdcBalance: () => mockUsdcBalanceState,
}))

vi.mock('../wallet/vault', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../wallet/vault')>()
  return {
    ...actual,
    submitDeposit: vi.fn(),
  }
})

describe('Deposit — Live USDC Balance and Cap Enforcement (#698)', () => {
  beforeEach(() => {
    mockWallet.address = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
    mockWallet.connected = true
    mockWallet.isDemo = false
    mockUsdcBalanceState.balance = 5000
    mockUsdcBalanceState.loading = false
    mockUsdcBalanceState.error = null
  })

  it('uses the on-chain USDC balance for the balance line, Max chip, and cap notice', () => {
    mockUsdcBalanceState.balance = 5000
    render(<Deposit onDone={vi.fn()} />)

    // Balance line displays the 5000 USDC balance instead of 240
    expect(screen.getByText(/5000\.00 USDC/i)).toBeInTheDocument()
    expect(screen.queryByText(/240\.00 USDC/i)).not.toBeInTheDocument()

    // Typing an amount higher than 5000 displays the cap notice with $5000
    const input = screen.getByLabelText(/Amount/i)
    fireEvent.change(input, { target: { value: '6000' } })

    expect(screen.getByText(/You hold a balance of \$5000/i)).toBeInTheDocument()
    const submitBtn = screen.getByRole('button', { name: /^invest$/i })
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveAttribute('title', 'Amount exceeds your balance — use Max')
  })

  it('prevents continuation when wallet balance is less than minimum deposit', () => {
    // 50 USDC is below the 100 USDC minDeposit
    mockUsdcBalanceState.balance = 50
    render(<Deposit onDone={vi.fn()} />)

    expect(screen.getByText(/50\.00 USDC/i)).toBeInTheDocument()

    // Submit button shows the exceeds balance reason and is disabled
    const submitBtn = screen.getByRole('button', { name: /^invest$/i })
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveAttribute('title', 'Amount exceeds your balance — use Max')

    // User cannot continue to review step
    fireEvent.click(submitBtn)
    expect(screen.queryByText(/You're investing/i)).not.toBeInTheDocument()
  })

  it('shows "Balance unavailable" and does not enforce an artificial cap when balance cannot be read', () => {
    mockUsdcBalanceState.balance = null
    render(<Deposit onDone={vi.fn()} />)

    // Displays "Balance unavailable" without inventing a number
    expect(screen.getByText(/Balance unavailable/i)).toBeInTheDocument()
    expect(screen.queryByText(/240/i)).not.toBeInTheDocument()

    // An investment above 240 (e.g. 1000) does not trigger a cap notice
    const input = screen.getByLabelText(/Amount/i)
    fireEvent.change(input, { target: { value: '1000' } })

    expect(screen.queryByText(/You hold a balance of/i)).not.toBeInTheDocument()

    // Submit button is enabled and transitions to review
    const submitBtn = screen.getByRole('button', { name: /Invest 1000 USDC/i })
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    expect(screen.getByText(/You're investing 1000 USDC in the pool/i)).toBeInTheDocument()
  })

  it('preserves demo fixture balance when in demo mode', () => {
    mockWallet.isDemo = true
    mockUsdcBalanceState.balance = 240
    render(<Deposit onDone={vi.fn()} />)

    expect(screen.getByText(/240\.00 USDC/i)).toBeInTheDocument()
  })
})
