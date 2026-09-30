import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function FocusTrapHarness({ open, onEscape }: { open: boolean; onEscape: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, dialogRef, undefined, onEscape)

  return (
    <>
      <button type="button">Open dialog</button>
      {open && (
        <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </div>
      )}
      <button type="button">Outside action</button>
    </>
  )
}

describe('useFocusTrap', () => {
  it('wraps Tab and Shift+Tab at both ends of the dialog', () => {
    render(<FocusTrapHarness open onEscape={vi.fn()} />)
    const first = screen.getByRole('button', { name: 'First action' })
    const last = screen.getByRole('button', { name: 'Last action' })

    expect(first).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(first).toHaveFocus()
  })

  it('pulls programmatic focus back inside and handles Escape', () => {
    const onEscape = vi.fn()
    render(<FocusTrapHarness open onEscape={onEscape} />)
    screen.getByRole('button', { name: 'Outside action' }).focus()
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('restores focus to the opener when the dialog closes', () => {
    const { rerender } = render(<FocusTrapHarness open={false} onEscape={vi.fn()} />)
    const opener = screen.getByRole('button', { name: 'Open dialog' })
    opener.focus()

    rerender(<FocusTrapHarness open onEscape={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus()

    rerender(<FocusTrapHarness open={false} onEscape={vi.fn()} />)
    expect(opener).toHaveFocus()
  })
})
