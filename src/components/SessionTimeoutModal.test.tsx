import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { SessionTimeoutModal } from './SessionTimeoutModal'

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
})
