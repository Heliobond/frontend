// src/lib/tax-report.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeQuarterlyTaxReport,
  quarterlyReportToCsv,
  getQuarter,
  activityToInvestmentEvents,
  type InvestmentEvent,
} from './tax-report'
import type { Activity } from '../data'

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

describe('activityToInvestmentEvents (#787)', () => {
  it('converts portfolio activity feed items into investment events', () => {
    const activity: Activity[] = [
      {
        kind: 'Deposit',
        amount: '$1,000.00',
        shares: '1,000 HBS',
        when: '2025-01-15',
        hash: '0xhash1',
      },
      {
        kind: 'Withdrawal',
        amount: '$400.00',
        shares: '400 HBS',
        when: '2025-04-10',
        hash: '0xhash2',
      },
      {
        kind: 'Score update',
        amount: '',
        shares: '',
        when: '2025-05-01',
        hash: '0xhash3',
      },
    ]

    const events = activityToInvestmentEvents(activity)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      id: '0xhash1',
      type: 'deposit',
      amountUSD: 1000,
      date: '2025-01-15',
    })
    expect(events[1]).toMatchObject({
      id: '0xhash2',
      type: 'withdrawal',
      amountUSD: 400,
      date: '2025-04-10',
    })
  })

  it('handles empty activity list', () => {
    expect(activityToInvestmentEvents([])).toEqual([])
  })
})
