import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { TaxReports } from './TaxReports'
import * as taxReportLib from '@/lib/tax-report'
import type { Activity } from '@/data'

const mockWallet = {
  address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
  connected: true,
  isDemo: false,
}

const mockPortfolio = {
  activity: [] as Activity[],
}

vi.mock('@/wallet/WalletProvider', () => ({
  useWallet: () => mockWallet,
}))

vi.mock('@/hooks/usePortfolio', () => ({
  usePortfolio: () => mockPortfolio,
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    shouldShowDemoBadge: () => mockWallet.isDemo || !mockWallet.connected,
  }
})

vi.mock('@/lib/tax-report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tax-report')>()
  return {
    ...actual,
    downloadCsv: vi.fn(),
  }
})

describe('TaxReports screen (#787)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWallet.address = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
    mockWallet.connected = true
    mockWallet.isDemo = false
    mockPortfolio.activity = []
  })

  it('renders real wallet activity and hides DemoDataBadge for connected real wallet', () => {
    mockWallet.connected = true
    mockWallet.isDemo = false
    mockPortfolio.activity = [
      {
        kind: 'Deposit',
        amount: '$2,500.00',
        shares: '2,500 HBS',
        when: '2025-02-10',
        hash: '0xtx1',
      },
      {
        kind: 'Withdrawal',
        amount: '$500.00',
        shares: '500 HBS',
        when: '2025-05-20',
        hash: '0xtx2',
      },
    ]

    render(<TaxReports />)

    // Demo badge must NOT appear for connected real wallet
    expect(screen.queryByText(/demo data/i)).toBeNull()

    // Real quarters are rendered
    expect(screen.getByText('2025-Q1')).toBeInTheDocument()
    expect(screen.getByText('2025-Q2')).toBeInTheDocument()
    expect(screen.getByText('$2500.00')).toBeInTheDocument()
    expect(screen.getByText('$500.00')).toBeInTheDocument()
  })

  it('displays empty state message when connected real wallet has no activity', () => {
    mockWallet.connected = true
    mockWallet.isDemo = false
    mockPortfolio.activity = []

    render(<TaxReports />)

    expect(screen.queryByText(/demo data/i)).toBeNull()
    expect(screen.getByText('No investment activity recorded for this wallet.')).toBeInTheDocument()
  })

  it('shows DemoDataBadge and renders placeholder events in demo mode', () => {
    mockWallet.connected = true
    mockWallet.isDemo = true
    mockPortfolio.activity = []

    render(<TaxReports />)

    // Demo badge must appear in demo mode
    expect(screen.getByText(/demo data/i)).toBeInTheDocument()

    // Renders default placeholder quarters
    expect(screen.getByText('2025-Q1')).toBeInTheDocument()
    expect(screen.getByText('2025-Q3')).toBeInTheDocument()
    expect(screen.getByText('2025-Q4')).toBeInTheDocument()
  })

  it('shows DemoDataBadge when disconnected', () => {
    mockWallet.connected = false
    mockWallet.isDemo = false
    mockPortfolio.activity = []

    render(<TaxReports />)

    expect(screen.getByText(/demo data/i)).toBeInTheDocument()
  })

  it('triggers CSV download when Export CSV button is clicked', () => {
    mockWallet.isDemo = true
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
