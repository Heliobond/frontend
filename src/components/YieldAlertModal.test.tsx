import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { YieldAlertModal } from './YieldAlertModal'

function renderModal(overrides: Partial<React.ComponentProps<typeof YieldAlertModal>> = {}) {
  const onClose = vi.fn()
  const view = render(
    <YieldAlertModal
      open
      bondName="Kalahari Solar"
      currentYield={4.2}
      onSave={vi.fn()}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { ...view, onClose }
}

describe('YieldAlertModal viewport handling', () => {
  it('caps the dialog to the viewport and scrolls its contents', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')

    expect(dialog.style.maxHeight).toBe('calc(100dvh - 32px)')
    expect(dialog.style.overflowY).toBe('auto')
    expect(dialog.style.overflow).not.toBe('hidden')
  })

  it('keeps the dialog centered at standard height', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement

    expect(dialog.style.position).toBe('fixed')
    expect(dialog.style.top).toBe('50%')
    expect(dialog.style.left).toBe('50%')
    expect(backdrop?.style.display).toBe('flex')
    expect(backdrop?.style.alignItems).toBe('center')
    expect(backdrop?.style.justifyContent).toBe('center')
  })

  it('keeps every form action available inside the scrolling dialog', () => {
    renderModal({ editing: true, onDelete: vi.fn() })

    expect(screen.getByLabelText('Threshold')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Above' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Below' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Cancel' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save alert' })).toBeInTheDocument()
  })

  it('still closes from the backdrop but not from clicks inside the dialog', () => {
    const { onClose } = renderModal()
    const dialog = screen.getByRole('dialog')

    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(dialog.parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
