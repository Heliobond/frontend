import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { TaxReports } from './TaxReports'
import * as taxReportLib from '@/lib/tax-report'

vi.mock('@/lib/tax-report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tax-report')>()
  return {
    ...actual,
    downloadCsv: vi.fn(),
  }
})

describe('TaxReports screen (#786)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders table and does not show skipped alert when all events have valid dates', () => {
    render(<TaxReports />)

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByTestId('tax-reports-skipped-alert')).toBeNull()
    expect(screen.getByText('2025-Q1')).toBeInTheDocument()
    expect(screen.getByText('2025-Q2')).toBeInTheDocument()
  })

  it('surfaces the skipped count banner when input contains invalid dates', () => {
    const mixedEvents: taxReportLib.InvestmentEvent[] = [
      {
        id: '1',
        projectName: 'Solar Farm A',
        date: '2025-01-10',
        type: 'deposit',
        amountUSD: 1000,
      },
      {
        id: '2',
        projectName: 'Corrupted Project',
        date: 'invalid-date',
        type: 'deposit',
        amountUSD: 200,
      },
      {
        id: '3',
        projectName: 'Missing Date Project',
        date: '',
        type: 'distribution',
        amountUSD: 50,
      },
      { id: '4', projectName: 'Wind Co B', date: '2025-04-05', type: 'deposit', amountUSD: 500 },
    ]

    render(<TaxReports events={mixedEvents} />)

    const alert = screen.getByTestId('tax-reports-skipped-alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/2 events with invalid dates were excluded/i)

    // Valid quarters are still rendered and no NaN-QNaN row exists
    expect(screen.getByText('2025-Q1')).toBeInTheDocument()
    expect(screen.getByText('2025-Q2')).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).toBeNull()
  })

  it('triggers CSV download when Export CSV button is clicked', () => {
    render(<TaxReports />)

    const exportBtn = screen.getByRole('button', { name: /export csv/i })
    fireEvent.click(exportBtn)

    expect(taxReportLib.downloadCsv).toHaveBeenCalledTimes(1)
    expect(taxReportLib.downloadCsv).toHaveBeenCalledWith(
      expect.stringMatching(/^heliobond-quarterly-tax-report-\d{4}\.csv$/),
      expect.stringContaining('Quarter,Type,Total Deposits (USD)'),
    )
  })
})
