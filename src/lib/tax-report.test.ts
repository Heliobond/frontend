// src/lib/tax-report.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeQuarterlyTaxReport,
  computeQuarterlyTaxReportDetailed,
  quarterlyReportToCsv,
  getQuarter,
  type InvestmentEvent,
} from './tax-report'

describe('getQuarter', () => {
  it('maps January to Q1', () => {
    expect(getQuarter('2025-01-15')).toEqual({ year: 2025, quarterNumber: 1 })
  })
  it('maps March 31 (boundary) to Q1', () => {
    expect(getQuarter('2025-03-31')).toEqual({ year: 2025, quarterNumber: 1 })
  })
  it('maps April 1 (boundary) to Q2', () => {
    expect(getQuarter('2025-04-01')).toEqual({ year: 2025, quarterNumber: 2 })
  })
  it('maps December 31 to Q4', () => {
    expect(getQuarter('2025-12-31')).toEqual({ year: 2025, quarterNumber: 4 })
  })
  it('returns null for invalid or non-ISO dates', () => {
    expect(getQuarter('invalid-date')).toBeNull()
    expect(getQuarter('')).toBeNull()
    expect(getQuarter('2025-Q1')).toBeNull()
    expect(getQuarter('undefined')).toBeNull()
  })
})

describe('computeQuarterlyTaxReport', () => {
  const events: InvestmentEvent[] = [
    { id: '1', projectName: 'Solar Farm A', date: '2025-01-10', type: 'deposit', amountUSD: 1000 },
    {
      id: '2',
      projectName: 'Solar Farm A',
      date: '2025-02-01',
      type: 'distribution',
      amountUSD: 50,
      costBasisUSD: 0,
    },
    {
      id: '3',
      projectName: 'Solar Farm A',
      date: '2025-04-05',
      type: 'withdrawal',
      amountUSD: 600,
      costBasisUSD: 500,
    },
    { id: '4', projectName: 'Wind Co B', date: '2025-04-20', type: 'deposit', amountUSD: 300 },
  ]

  it('groups events into the correct quarters', () => {
    const report = computeQuarterlyTaxReport(events)
    expect(report.map((l) => l.quarter)).toEqual(['2025-Q1', '2025-Q2'])
  })

  it('sums deposits, withdrawals, and distributions per quarter', () => {
    const report = computeQuarterlyTaxReport(events)
    const q1 = report.find((l) => l.quarter === '2025-Q1')!
    expect(q1.totalDeposits).toBe(1000)
    expect(q1.totalDistributions).toBe(50)

    const q2 = report.find((l) => l.quarter === '2025-Q2')!
    expect(q2.totalWithdrawals).toBe(600)
    expect(q2.totalDeposits).toBe(300)
  })

  it('computes realized gain: deposits contribute 0, distributions/withdrawals net cost basis', () => {
    const report = computeQuarterlyTaxReport(events)
    const q1 = report.find((l) => l.quarter === '2025-Q1')!
    expect(q1.realizedGainUSD).toBe(50) // distribution only, no cost basis

    const q2 = report.find((l) => l.quarter === '2025-Q2')!
    expect(q2.realizedGainUSD).toBe(100) // 600 - 500 cost basis, deposit contributes 0
  })

  it('returns an empty array for no events', () => {
    expect(computeQuarterlyTaxReport([])).toEqual([])
  })

  it('sorts multi-year results chronologically', () => {
    const multiYear: InvestmentEvent[] = [
      { id: 'a', projectName: 'X', date: '2026-01-05', type: 'deposit', amountUSD: 100 },
      { id: 'b', projectName: 'X', date: '2025-11-01', type: 'deposit', amountUSD: 100 },
    ]
    const report = computeQuarterlyTaxReport(multiYear)
    expect(report.map((l) => l.quarter)).toEqual(['2025-Q4', '2026-Q1'])
  })
})

describe('quarterlyReportToCsv', () => {
  it('produces a header row plus one row per quarter', () => {
    const events: InvestmentEvent[] = [
      {
        id: '1',
        projectName: 'Solar Farm A',
        date: '2025-01-10',
        type: 'deposit',
        amountUSD: 1000,
      },
    ]
    const csv = quarterlyReportToCsv(computeQuarterlyTaxReport(events))
    const lines = csv.split('\n')
    expect(lines[0]).toBe(
      'Quarter,Type,Total Deposits (USD),Total Withdrawals (USD),Total Distributions (USD),Realized Gain (USD),Project Name,Event Type,Amount (USD),Cost Basis (USD)',
    )
    expect(lines[1]).toBe('2025-Q1,Quarter Summary,1000.00,0.00,0.00,0.00,,,,')
    expect(lines[2]).toBe(',Event Detail,,,,,Solar Farm A,deposit,1000.00,0.00')
  })

  it('quotes commas, quotes and newlines in project names', () => {
    const events: InvestmentEvent[] = [
      {
        id: '1',
        projectName: 'Solar, Wind & "Hydro"',
        date: '2025-01-10',
        type: 'deposit',
        amountUSD: 1000,
      },
      {
        id: '2',
        projectName: 'Line one\nLine two',
        date: '2025-01-11',
        type: 'deposit',
        amountUSD: 10,
      },
    ]
    const csv = quarterlyReportToCsv(computeQuarterlyTaxReport(events))
    expect(csv).toContain(',"Solar, Wind & ""Hydro""",deposit,1000.00,0.00')
    expect(csv).toContain(',"Line one\nLine two",deposit,10.00,0.00')
  })

  it('neutralises spreadsheet formulas in project names', () => {
    const events: InvestmentEvent[] = [
      {
        id: '1',
        projectName: "=cmd|' /C calc'!A0",
        date: '2025-01-10',
        type: 'deposit',
        amountUSD: 1000,
      },
      {
        id: '2',
        projectName: '+1+1',
        date: '2025-01-11',
        type: 'deposit',
        amountUSD: 10,
      },
      {
        id: '3',
        projectName: '@SUM(A1)',
        date: '2025-01-12',
        type: 'deposit',
        amountUSD: 10,
      },
    ]
    const csv = quarterlyReportToCsv(computeQuarterlyTaxReport(events))
    expect(csv).toContain("'=cmd|' /C calc'!A0,deposit,1000.00,0.00")
    expect(csv).toContain("'+1+1,deposit,10.00,0.00")
    expect(csv).toContain("'@SUM(A1),deposit,10.00,0.00")
  })

  it('keeps negative numeric fields unquoted', () => {
    const events: InvestmentEvent[] = [
      {
        id: '1',
        projectName: 'Solar Farm A',
        date: '2025-01-10',
        type: 'withdrawal',
        amountUSD: 100,
        costBasisUSD: 200,
      },
    ]
    const csv = quarterlyReportToCsv(computeQuarterlyTaxReport(events))
    expect(csv.split('\n')[1]).toBe('2025-Q1,Quarter Summary,0.00,100.00,0.00,-100.00,,,,')
  })
})

describe('computeQuarterlyTaxReport date validation (#786)', () => {
  it('skips invalid dates and never creates a NaN-QNaN quarter row', () => {
    const mixedEvents: InvestmentEvent[] = [
      {
        id: '1',
        projectName: 'Solar Farm A',
        date: '2025-01-15',
        type: 'deposit',
        amountUSD: 1000,
      },
      {
        id: '2',
        projectName: 'Corrupt Date 1',
        date: 'not-a-date',
        type: 'deposit',
        amountUSD: 200,
      },
      { id: '3', projectName: 'Corrupt Date 2', date: '', type: 'distribution', amountUSD: 50 },
      {
        id: '4',
        projectName: 'Corrupt Date 3',
        date: '2025-Q1',
        type: 'withdrawal',
        amountUSD: 100,
      },
      { id: '5', projectName: 'Wind Farm B', date: '2025-04-20', type: 'deposit', amountUSD: 500 },
    ]

    const report = computeQuarterlyTaxReport(mixedEvents)

    // Invalid dates must never create quarter rows
    expect(report.map((l) => l.quarter)).toEqual(['2025-Q1', '2025-Q2'])
    expect(report.some((l) => l.quarter.includes('NaN'))).toBe(false)
    expect(report.skippedCount).toBe(3)
    expect(report.skippedEvents.map((e) => e.id)).toEqual(['2', '3', '4'])

    // Generated CSV must not contain any NaN-QNaN
    const csv = quarterlyReportToCsv(report)
    expect(csv).not.toContain('NaN')
    expect(csv).toContain('2025-Q1')
    expect(csv).toContain('2025-Q2')

    // Detailed report returns matching metadata
    const detailed = computeQuarterlyTaxReportDetailed(mixedEvents)
    expect(detailed.skippedCount).toBe(3)
    expect(detailed.lines.map((l) => l.quarter)).toEqual(['2025-Q1', '2025-Q2'])
    expect(detailed.skippedEvents.length).toBe(3)
  })

  it('returns empty array and surfaces skipped count when all dates are invalid', () => {
    const invalidEvents: InvestmentEvent[] = [
      { id: '1', projectName: 'Corrupt', date: 'malformed-date', type: 'deposit', amountUSD: 300 },
    ]
    const report = computeQuarterlyTaxReport(invalidEvents)
    expect(report).toEqual([])
    expect(report.skippedCount).toBe(1)
    expect(report.skippedEvents[0].id).toBe('1')
  })
})
