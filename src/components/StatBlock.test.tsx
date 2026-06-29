import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatBlock } from './StatBlock'

describe('StatBlock delta direction inference', () => {
  it('infers "up" direction and shows ↑ for a positive delta', () => {
    render(<StatBlock label="Price" value="$100" delta="+5%" />)
    expect(screen.getByText(/↑/)).toBeInTheDocument()
    expect(screen.getByText(/\+5%/)).toBeInTheDocument()
  })

  it('infers "down" direction and shows ↓ for a negative delta', () => {
    render(<StatBlock label="Price" value="$100" delta="-3.2%" />)
    expect(screen.getByText(/↓/)).toBeInTheDocument()
    expect(screen.getByText(/-3\.2%/)).toBeInTheDocument()
  })

  it('infers "up" when delta has no sign prefix', () => {
    render(<StatBlock label="Price" value="$100" delta="2%" />)
    expect(screen.getByText(/↑/)).toBeInTheDocument()
  })

  it('infers "down" when delta starts with whitespace then minus', () => {
    render(<StatBlock label="Price" value="$100" delta=" -1%" />)
    expect(screen.getByText(/↓/)).toBeInTheDocument()
  })

  it('uses explicit deltaDirection="down" even if delta looks positive', () => {
    render(<StatBlock label="Price" value="$100" delta="+10%" deltaDirection="down" />)
    expect(screen.getByText(/↓/)).toBeInTheDocument()
  })

  it('uses explicit deltaDirection="up" even if delta looks negative', () => {
    render(<StatBlock label="Price" value="$100" delta="-7%" deltaDirection="up" />)
    expect(screen.getByText(/↑/)).toBeInTheDocument()
  })

  it('does not render delta span when delta is undefined', () => {
    const { container } = render(<StatBlock label="Price" value="$100" />)
    expect(container.textContent).not.toContain('↑')
    expect(container.textContent).not.toContain('↓')
  })
})
