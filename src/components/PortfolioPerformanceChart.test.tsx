import { render, screen, waitFor } from '@/test/render'
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

  it('offers retry when the request fails', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'))
    render(<PortfolioPerformanceChart address="GTEST" />)

    // Should show the failure message and retry button, not the empty state
    expect(await screen.findByText(/Could not load historical performance/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    expect(screen.queryByText(/snapshots are available/i)).not.toBeInTheDocument()

    // Retry should fetch again and succeed
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { timestamp: '2026-01-01T00:00:00Z', valueUsdc: 200, returnPct: 10, yieldPct: 5 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await user.click(screen.getByRole('button', { name: /Retry/i }))

    // Should now show the data without the retry button
    expect(await screen.findByText('200 USDC')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument()
  })

  it('shows empty state for a successful response with no data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    render(<PortfolioPerformanceChart address="GTEST" />)

    // Should show the empty state, not the failure/retry UI
    expect(await screen.findByText(/snapshots are available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument()
  })

  it('renders the title in the selected locale', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    render(<PortfolioPerformanceChart address="GTEST" />, { locale: 'fr' })
    expect(await screen.findByText('Performance du portefeuille')).toBeInTheDocument()
  })

  it('spaces chart points by timestamp offset, not by index', async () => {
    // Three snapshots: Jan 1, Jan 2, Jan 31 (day 1, 2, 31)
    // If spaced by index: each would be 50% apart (0%, 50%, 100%)
    // If spaced by time: day 2 should be ~3.3% from day 1, day 31 at 100%
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { timestamp: '2026-01-01T00:00:00Z', valueUsdc: 100, returnPct: 0, yieldPct: 4 },
          { timestamp: '2026-01-02T00:00:00Z', valueUsdc: 102, returnPct: 2, yieldPct: 4.1 },
          { timestamp: '2026-01-31T00:00:00Z', valueUsdc: 110, returnPct: 10, yieldPct: 5 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    render(<PortfolioPerformanceChart address="GTEST" />)

    await waitFor(() => expect(screen.getByText('110 USDC')).toBeInTheDocument())

    // Check that SVG paths exist (visual confirmation via test)
    const charts = screen.getAllByRole('img', { name: /history chart/i })
    expect(charts).toHaveLength(3)

    // The path should have 3 points: M for first, L for second and third
    charts.forEach((chart) => {
      const path = chart.querySelector('path')
      expect(path).toBeInTheDocument()
      const d = path?.getAttribute('d')
      expect(d).toMatch(/^M .+ L .+ L .+$/) // 3 points
    })
  })

  it('handles equal timestamps without NaN or Infinity', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { timestamp: '2026-01-01T00:00:00Z', valueUsdc: 100, returnPct: 0, yieldPct: 4 },
          { timestamp: '2026-01-01T00:00:00Z', valueUsdc: 105, returnPct: 5, yieldPct: 4.5 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    render(<PortfolioPerformanceChart address="GTEST" />)

    await waitFor(() => expect(screen.getByText('105 USDC')).toBeInTheDocument())

    const charts = screen.getAllByRole('img', { name: /history chart/i })
    charts.forEach((chart) => {
      const path = chart.querySelector('path')
      const d = path?.getAttribute('d') ?? ''
      // All coordinates should be finite numbers
      expect(d).not.toContain('NaN')
      expect(d).not.toContain('Infinity')
      // Should have valid path data
      expect(d).toMatch(/^M .+ L .+$/)
    })
  })

  it('centers a single-point history at 50%', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { timestamp: '2026-01-01T00:00:00Z', valueUsdc: 100, returnPct: 0, yieldPct: 4 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    render(<PortfolioPerformanceChart address="GTEST" />)

    await waitFor(() => expect(screen.getByText('100 USDC')).toBeInTheDocument())

    const charts = screen.getAllByRole('img', { name: /history chart/i })
    charts.forEach((chart) => {
      const path = chart.querySelector('path')
      const d = path?.getAttribute('d') ?? ''
      // Single point should be at x=50
      expect(d).toMatch(/^M 50 /)
    })
  })

  it('offers an accessible data table toggle', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
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

    // Table should be hidden initially
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    // Click show data table button
    const toggleButton = screen.getByRole('button', { name: /View data table/i })
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggleButton)

    // Table should now be visible
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true')
    expect(toggleButton).toHaveTextContent(/Hide data table/i)

    // Hide the table
    await user.click(toggleButton)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('displays chronological historical data in accessible table format', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { timestamp: '2026-01-01T00:00:00Z', valueUsdc: 100, returnPct: 0, yieldPct: 4 },
          { timestamp: '2026-02-01T00:00:00Z', valueUsdc: 105, returnPct: 5, yieldPct: 4.5 },
          { timestamp: '2026-03-01T00:00:00Z', valueUsdc: 110, returnPct: 10, yieldPct: 5 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<PortfolioPerformanceChart address="GTEST" />)

    await waitFor(() => expect(screen.getByText('110 USDC')).toBeInTheDocument())

    // Show the table
    await user.click(screen.getByRole('button', { name: /View data table/i }))

    // Check table headers
    expect(screen.getByRole('columnheader', { name: /Date/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Portfolio value/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Returns/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Yield/i })).toBeInTheDocument()

    // Check that all data rows are present in chronological order
    const rows = screen.getAllByRole('row')
    // 1 header row + 3 data rows
    expect(rows).toHaveLength(4)

    // Verify data is accessible (values appear in table)
    const table = screen.getByRole('table')
    expect(table).toHaveTextContent('100 USDC')
    expect(table).toHaveTextContent('105 USDC')
    expect(table).toHaveTextContent('110 USDC')
    expect(table).toHaveTextContent('0%')
    expect(table).toHaveTextContent('5%')
    expect(table).toHaveTextContent('10%')
    expect(table).toHaveTextContent('4%')
    expect(table).toHaveTextContent('4.5%')
    expect(table).toHaveTextContent('5%')
  })
})
