import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LiquidityMeter } from './LiquidityMeter'

describe('LiquidityMeter percentage and formatting', () => {
  it('computes correct percentage for normal liquid/total', () => {
    render(<LiquidityMeter liquid={250_000} total={1_000_000} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '25')
  })

  it('clamps percentage to 100 when liquid exceeds total', () => {
    render(<LiquidityMeter liquid={1_500_000} total={1_000_000} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '100')
  })

  it('returns 0% when total is zero', () => {
    render(<LiquidityMeter liquid={0} total={0} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '0')
  })

  it('returns 0% when liquid is 0 and total is positive', () => {
    render(<LiquidityMeter liquid={0} total={500_000} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '0')
  })

  it('clamps negative liquid to 0%', () => {
    render(<LiquidityMeter liquid={-100} total={1_000} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '0')
  })

  it('formats currency with the default $ symbol', () => {
    render(<LiquidityMeter liquid={1_234_567} total={5_000_000} />)
    expect(screen.getByText('$1,234,567')).toBeInTheDocument()
  })

  it('formats currency with a custom currency symbol', () => {
    render(<LiquidityMeter liquid={500} total={1_000} currency="€" />)
    expect(screen.getByText('€500')).toBeInTheDocument()
  })

  it('shows the deployed amount in the explanation text', () => {
    render(<LiquidityMeter liquid={200_000} total={1_000_000} />)
    expect(screen.getByText(/\$800,000\).*is working in projects/)).toBeInTheDocument()
  })
})
