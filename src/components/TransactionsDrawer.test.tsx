import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../../messages/en.json'
import { TransactionsDrawer } from './TransactionsDrawer'
import { recordTransaction } from '../wallet/transactions'
import { TransactionsProvider } from '../wallet/TransactionsProvider'

// Mock AddressChip to test rendering
vi.mock('./AddressChip', () => ({
  AddressChip: ({ value, explorerUrl }: { value: string; explorerUrl?: string }) => (
    <a href={explorerUrl}>{value}</a>
  ),
}))

const render = (ui: ReactElement) =>
  rtlRender(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={en}>
        {children}
      </NextIntlClientProvider>
    ),
  })

beforeEach(() => sessionStorage.clear())

describe('TransactionsDrawer', () => {
  it('does not render when closed', () => {
    const { container } = render(
      <TransactionsProvider>
        <TransactionsDrawer open={false} onClose={() => {}} />
      </TransactionsProvider>,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders title and empty state when open', () => {
    render(
      <TransactionsProvider>
        <TransactionsDrawer open={true} onClose={() => {}} />
      </TransactionsProvider>,
    )

    expect(screen.getByText('Transaction Activity')).toBeInTheDocument()
    expect(screen.getByText('No transactions recorded in this session.')).toBeInTheDocument()
  })
  it('renders statuses, XLM fee components, explorer links, and keyboard dismissal', () => {
    const onClose = vi.fn()
    render(
      <TransactionsProvider>
        <TransactionsDrawer open onClose={onClose} />
      </TransactionsProvider>,
    )
    act(() =>
      recordTransaction({
        hash: 'test-hash',
        kind: 'deposit',
        status: 'confirmed',
        amount: 100,
        fee: 0.2,
        inclusionFee: 0.01,
        resourceFee: 0.19,
        network: 'testnet',
      }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('Estimated maximum fee: 0.2000000 XLM')).toBeInTheDocument()
    expect(screen.getByText('Resource fee: 0.1900000 XLM')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'test-hash' })).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/tx/test-hash',
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
