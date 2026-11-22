import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from '@/test/bun'

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

await vi.mockModule(import.meta.resolve('../wallet/vault'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../wallet/vault')>()
  return {
    ...actual,
    submitDeposit: vi.fn(),
  }
})

const { render, screen, fireEvent, waitFor } = await import('@/test/render')
const { Deposit } = await import('./Deposit')

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
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true')
    expect(submitBtn).toHaveAttribute('aria-describedby', 'deposit-submit-reason')
    expect(screen.getByText('Amount exceeds your balance — use Max')).toBeInTheDocument()
  })

  it('prevents continuation when wallet balance is less than minimum deposit', () => {
    // 50 USDC is below the 100 USDC minDeposit
    mockUsdcBalanceState.balance = 50
    render(<Deposit onDone={vi.fn()} />)

    expect(screen.getByText(/50\.00 USDC/i)).toBeInTheDocument()

    // Submit button shows the exceeds balance reason and is disabled
    const submitBtn = screen.getByRole('button', { name: /^invest$/i })
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true')

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

describe('Deposit — Keyboard Navigation and Form Submission Accessibility (#465)', () => {
  beforeEach(() => {
    mockWallet.address = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
    mockWallet.connected = true
    mockWallet.isDemo = false
    mockUsdcBalanceState.balance = 5000
    mockUsdcBalanceState.loading = false
    mockUsdcBalanceState.error = null
  })

  it('keeps the aria-disabled submit button itself in the tab order', async () => {
    const user = userEvent.setup()
    render(<Deposit onDone={vi.fn()} />)

    // Clear input to an invalid state (< minDeposit)
    const amountInput = screen.getByLabelText(/Amount/i)
    fireEvent.change(amountInput, { target: { value: '25' } })

    const submitBtn = screen.getByRole('button', { name: /^invest$/i })
    expect(submitBtn).toHaveAttribute('type', 'submit')
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true')
    expect(submitBtn).not.toBeDisabled()

    amountInput.focus()
    // Three preset chips, Max, memo, and recurring checkbox precede submit.
    for (let i = 0; i < 7; i += 1) await user.tab()
    expect(submitBtn).toHaveFocus()
  })

  it('submits a valid amount when Enter is pressed in the amount field', async () => {
    const user = userEvent.setup()
    render(<Deposit onDone={vi.fn()} />)

    const amountInput = screen.getByLabelText(/Amount/i)
    fireEvent.change(amountInput, { target: { value: '500' } })

    amountInput.focus()
    await user.keyboard('{Enter}')

    // Transitions directly to review step without needing a mouse click
    expect(screen.getByText(/You're investing 500 USDC in the pool/i)).toBeInTheDocument()
  })

  it('validates an invalid amount when Enter is pressed in the amount field and returns focus', async () => {
    const user = userEvent.setup()
    render(<Deposit onDone={vi.fn()} />)

    const amountInput = screen.getByLabelText(/Amount/i)
    fireEvent.change(amountInput, { target: { value: '20' } }) // below 100 USDC minDeposit

    amountInput.focus()
    await user.keyboard('{Enter}')

    // Displays role="alert" with the reason explaining what to correct
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/at least 100\.00 USDC/i)
    expect(amountInput).toHaveAttribute('aria-invalid', 'true')
    await screen.findByRole('alert')
    await waitFor(() => expect(amountInput).toHaveFocus(), { timeout: 1000 })

    // Does not advance to review
    expect(screen.queryByText(/You're investing/i)).not.toBeInTheDocument()
  })

  it.each(['{Enter}', ' '])('validates on %s from the aria-disabled submit button', async (key) => {
    const user = userEvent.setup()
    render(<Deposit onDone={vi.fn()} />)

    const amountInput = screen.getByLabelText(/Amount/i)
    fireEvent.change(amountInput, { target: { value: '6000' } }) // exceeds 5000 balance

    const submitBtn = screen.getByRole('button', { name: /^invest$/i })
    submitBtn.focus()
    await user.keyboard(key)

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/Amount exceeds your balance/i)
    expect(screen.queryByText(/You're investing/i)).not.toBeInTheDocument()
  })

  it('clears the validation alert as soon as the user corrects the amount', async () => {
    const user = userEvent.setup()
    render(<Deposit onDone={vi.fn()} />)
    const amountInput = screen.getByLabelText(/Amount/i)

    await user.clear(amountInput)
    amountInput.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.clear(amountInput)
    await user.type(amountInput, '500')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('returns focus to the invalid memo field when submission fails', async () => {
    const user = userEvent.setup()
    render(<Deposit onDone={vi.fn()} />)
    const memoInput = screen.getByLabelText(/Memo/i)

    await user.type(memoInput, 'a'.repeat(29))
    await user.keyboard('{Enter}')

    expect(document.getElementById('deposit-form-error')).toHaveTextContent('Memo exceeds 28 bytes')
    await waitFor(() => expect(memoInput).toHaveFocus(), { timeout: 1000 })
  })
})
