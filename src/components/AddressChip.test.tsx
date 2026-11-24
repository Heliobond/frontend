import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from '@/test/bun'
import en from '../../messages/en.json'
import type { ReactNode } from 'react'

vi.mock('./Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const { LocaleProvider } = await import('@/i18n/LocaleProvider')
const { ThemeProvider } = await import('@/theme/ThemeProvider')
const { AddressChip } = await import('./AddressChip')

const FULL_TX_HASH = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
const EXPLORER_URL = `https://stellar.expert/explorer/testnet/tx/${FULL_TX_HASH}`

function render(ui: ReactNode) {
  return rtlRender(
    <LocaleProvider initialLocale="en" initialMessages={en}>
      <ThemeProvider>{ui}</ThemeProvider>
    </LocaleProvider>,
  )
}

function mockClipboard(
  writeText = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve()),
) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

describe('AddressChip', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockClipboard()
  })

  test('middle-truncates long transaction values while keeping copy and explorer exact', async () => {
    const writeText = mockClipboard()

    render(<AddressChip value={FULL_TX_HASH} explorerUrl={EXPLORER_URL} label="transaction hash" />)

    expect(screen.queryByText(FULL_TX_HASH)).not.toBeInTheDocument()
    expect(screen.getByText('abcdef…567890')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Copy transaction hash' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(FULL_TX_HASH)
    })

    expect(
      screen.getByRole('link', { name: 'View transaction hash on Stellar Expert' }),
    ).toHaveAttribute('href', EXPLORER_URL)
  })

  test.each(['succeeds', 'throws'])(
    'restores focus and removes the field when fallback copy %s',
    async (outcome) => {
      mockClipboard(vi.fn().mockRejectedValue(new Error('denied')))
      const execCommand = vi.fn(() => {
        if (outcome === 'throws') throw new Error('copy failed')
        return true
      })
      const original = Object.getOwnPropertyDescriptor(document, 'execCommand')
      Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

      try {
        render(<AddressChip value={FULL_TX_HASH} />)
        const button = screen.getByRole('button', { name: 'Copy address' })
        button.focus()
        fireEvent.click(button)

        await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'))
        expect(button).toHaveFocus()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      } finally {
        if (original) Object.defineProperty(document, 'execCommand', original)
        else Reflect.deleteProperty(document, 'execCommand')
      }
    },
  )

  test('leaves short values unmodified and handles copy failure without throwing', async () => {
    mockClipboard(
      vi.fn<(value: string) => Promise<void>>(() => Promise.reject(new Error('denied'))),
    )
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    })

    render(<AddressChip value="short-hash" label="transaction hash" />)

    expect(screen.getByText('short-hash')).toBeVisible()
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy transaction hash' }))
    }).not.toThrow()

    await waitFor(() => {
      expect(document.execCommand).toHaveBeenCalledWith('copy')
    })
  })
})
