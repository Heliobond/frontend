import { describe, it, expect, vi } from '@/test/bun'
import { render, screen, fireEvent } from '@/test/render'
import { TransactionsProvider } from '../wallet/TransactionsProvider'
import { SessionTimeoutModal } from './SessionTimeoutModal'
import { TransactionsDrawer } from './TransactionsDrawer'

describe('SessionTimeoutModal', () => {
  it('does not render when open is false', () => {
    render(
      <SessionTimeoutModal
        open={false}
        formattedTime="01:30"
        onExtend={vi.fn()}
        onLogout={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('renders modal with title, message, formatted time, and action buttons when open is true', () => {
    render(
      <SessionTimeoutModal
        open={true}
        formattedTime="01:45"
        onExtend={vi.fn()}
        onLogout={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Your session will expire soon')).toBeInTheDocument()
    expect(screen.getByText('01:45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stay connected' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect now' })).toBeInTheDocument()
  })

  it('fires onExtend when Stay connected button is clicked', () => {
    const onExtend = vi.fn()
    render(
      <SessionTimeoutModal
        open={true}
        formattedTime="01:45"
        onExtend={onExtend}
        onLogout={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stay connected' }))
    expect(onExtend).toHaveBeenCalledTimes(1)
  })

  it('fires onLogout when Disconnect now button is clicked', () => {
    const onLogout = vi.fn()
    render(
      <SessionTimeoutModal
        open={true}
        formattedTime="01:45"
        onExtend={vi.fn()}
        onLogout={onLogout}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect now' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('fires onExtend when Escape key is pressed to prevent accidental session drop', () => {
    const onExtend = vi.fn()
    render(
      <SessionTimeoutModal
        open={true}
        formattedTime="01:45"
        onExtend={onExtend}
        onLogout={vi.fn()}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExtend).toHaveBeenCalledTimes(1)
  })

  it('owns Tab and Escape over the transaction drawer and returns focus on close', () => {
    const onExtend = vi.fn()
    const onClose = vi.fn()
    const dialogs = (warningOpen: boolean) => (
      <TransactionsProvider>
        <SessionTimeoutModal
          open={warningOpen}
          formattedTime="01:45"
          onExtend={onExtend}
          onLogout={vi.fn()}
        />
        <TransactionsDrawer open onClose={onClose} />
      </TransactionsProvider>
    )
    const { rerender } = render(dialogs(false))
    const closeDrawer = screen.getByRole('button', { name: 'Close activity panel' })
    expect(closeDrawer).toHaveFocus()

    rerender(dialogs(true))
    const stay = screen.getByRole('button', { name: 'Stay connected' })
    expect(stay).toHaveFocus()
    fireEvent.keyDown(stay, { key: 'Tab' })
    const disconnect = screen.getByRole('button', { name: 'Disconnect now' })
    expect(disconnect).toHaveFocus()
    closeDrawer.focus()
    expect(disconnect).toHaveFocus()
    fireEvent.keyDown(disconnect, { key: 'Tab', shiftKey: true })
    expect(stay).toHaveFocus()
    fireEvent.keyDown(stay, { key: 'Escape' })
    expect(onExtend).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()

    rerender(dialogs(false))
    expect(closeDrawer).toHaveFocus()
    fireEvent.keyDown(closeDrawer, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
