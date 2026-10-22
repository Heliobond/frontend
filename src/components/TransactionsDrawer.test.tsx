import { act, fireEvent, screen } from '@testing-library/react'
import { render } from '@/test/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionsDrawer } from './TransactionsDrawer'
import { recordTransaction } from '../wallet/transactions'
import { TransactionsProvider } from '../wallet/TransactionsProvider'

// Mock AddressChip to test rendering
vi.mock('./AddressChip', () => ({
  AddressChip: ({ value, explorerUrl }: { value: string; explorerUrl?: string }) => (
    <a href={explorerUrl}>{value}</a>
  ),
}))

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

  it('renders translated labels in the selected locale', () => {
    render(
      <TransactionsProvider>
        <TransactionsDrawer open onClose={() => {}} />
      </TransactionsProvider>,
      { locale: 'fr' },
    )
    expect(screen.getByText('Activité des transactions')).toBeInTheDocument()
    expect(
      screen.getByText('Aucune transaction enregistrée dans cette session.'),
    ).toBeInTheDocument()
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
