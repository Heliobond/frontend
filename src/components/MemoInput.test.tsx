import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { MemoInput } from './MemoInput'

describe('MemoInput', () => {
  it('renders input with label and placeholder', () => {
    render(<MemoInput value="" onChange={vi.fn()} label="Custom Memo" placeholder="Enter memo" />)
    expect(screen.getByLabelText(/Custom Memo/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter memo')).toBeInTheDocument()
    expect(screen.getByText('0 / 28 bytes')).toBeInTheDocument()
  })

  it('updates live byte counter as text is typed', () => {
    const { rerender } = render(<MemoInput value="hello" onChange={vi.fn()} />)
    expect(screen.getByText('5 / 28 bytes')).toBeInTheDocument()

    rerender(<MemoInput value="hello world" onChange={vi.fn()} />)
    expect(screen.getByText('11 / 28 bytes')).toBeInTheDocument()
  })

  it('calls onChange when user types', () => {
    const handleChange = vi.fn()
    render(<MemoInput value="" onChange={handleChange} />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'invoice 99' } })
    expect(handleChange).toHaveBeenCalledWith('invoice 99')
  })

  it('shows error message and sets aria-invalid when memo exceeds 28 bytes', () => {
    const longMemo = 'a'.repeat(100)
    render(<MemoInput value={longMemo} onChange={vi.fn()} />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Memo cannot exceed 28 bytes (currently 100 bytes).',
    )
    expect(screen.getByText('100 / 28 bytes')).toBeInTheDocument()
  })

  it('correctly calculates byte count for UTF-8 multibyte characters', () => {
    // 8 emojis = 32 bytes
    const emojiMemo = '🚀🚀🚀🚀🚀🚀🚀🚀'
    render(<MemoInput value={emojiMemo} onChange={vi.fn()} />)

    expect(screen.getByText('32 / 28 bytes')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Memo cannot exceed 28 bytes (currently 32 bytes).',
    )
  })

  it('notifies onValidityChange callback', () => {
    const handleValidity = vi.fn()
    const { rerender } = render(
      <MemoInput value="valid memo" onChange={vi.fn()} onValidityChange={handleValidity} />,
    )
    expect(handleValidity).toHaveBeenCalledWith(true)

    rerender(
      <MemoInput value={'x'.repeat(100)} onChange={vi.fn()} onValidityChange={handleValidity} />,
    )
    expect(handleValidity).toHaveBeenCalledWith(false)
  })
})
