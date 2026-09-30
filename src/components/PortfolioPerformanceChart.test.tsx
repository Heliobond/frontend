import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortfolioPerformanceChart } from './PortfolioPerformanceChart'

describe('PortfolioPerformanceChart', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders historical value, return and yield series from indexed snapshots', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { timestamp: '2026-01-01T00:00:00Z', valueUsdc: 100, returnPct: 0, yieldPct: 4 },
          { timestamp: '2026-02-01T00:00:00Z', valueUsdc: 105, returnPct: 5, yieldPct: 4.5 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    render(<PortfolioPerformanceChart address="GTEST" />)

    await waitFor(() => expect(screen.getByText('105 USDC')).toBeInTheDocument())
    expect(screen.getByText('5%')).toBeInTheDocument()
    expect(screen.getByText('4.5%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Portfolio value history chart' })).toBeInTheDocument()
  })

  it('shows an honest empty state when history is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    render(<PortfolioPerformanceChart address="GTEST" />)
    expect(await screen.findByText(/snapshots are available/i)).toBeInTheDocument()
  })
})
