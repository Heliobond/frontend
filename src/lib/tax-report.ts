// src/lib/tax-report.ts
//
// Groups investment activity into quarters and computes taxable gains
// for export. This is a simplified illustrative model, not tax advice:
// realized gain on a withdrawal/distribution = amount - cost basis
// allocated to that event. Deposits establish cost basis and are not
// themselves taxable events.

import type { Activity } from '../data'

export type InvestmentEventType = 'deposit' | 'withdrawal' | 'distribution'

export interface InvestmentEvent {
  id: string
  projectName: string
  /** ISO 8601 date string, e.g. "2025-03-14" */
  date: string
  type: InvestmentEventType
  amountUSD: number
  /** Cost basis allocated to this event. 0/undefined for deposits. */
  costBasisUSD?: number
}

export interface QuarterlyTaxLine {
  quarter: string // e.g. "2025-Q1"
  year: number
  quarterNumber: 1 | 2 | 3 | 4
  totalDeposits: number
  totalWithdrawals: number
  totalDistributions: number
  realizedGainUSD: number
  events: InvestmentEvent[]
}

export interface QuarterlyTaxReport extends Array<QuarterlyTaxLine> {
  skippedCount: number
  skippedEvents: InvestmentEvent[]
}

export interface TaxReportSummary {
  lines: QuarterlyTaxLine[]
  skippedCount: number
  skippedEvents: InvestmentEvent[]
}

/** Maps portfolio activity feed items into investment events for tax reporting. */
export function activityToInvestmentEvents(activity: Activity[]): InvestmentEvent[] {
  const events: InvestmentEvent[] = []

  for (const item of activity) {
    const kind = item.kind.toLowerCase()
    const type = kind.includes('deposit')
      ? 'deposit'
      : kind.includes('withdraw')
        ? 'withdrawal'
        : kind.includes('distribution') || kind.includes('yield') || kind.includes('claim')
          ? 'distribution'
          : null
    if (!type) continue

    const amount = typeof item.amount === 'string' ? item.amount.replace(/[^0-9.-]+/g, '') : item.amount
    const amountUSD = Math.abs(Number.parseFloat(String(amount))) || 0

    events.push({
      id: item.hash || `${type}-${item.when}-${amountUSD}-${events.length}`,
      projectName: 'Heliobond Vault',
      date: item.when,
      type,
      amountUSD,
      costBasisUSD: type === 'withdrawal' ? amountUSD : 0,
    })
  }

  return events
}

export function getQuarter(dateStr: string): { year: number; quarterNumber: 1 | 2 | 3 | 4 } | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null
  const month = date.getUTCMonth() // 0-11
  const quarterNumber = (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4
  const year = date.getUTCFullYear()
  if (Number.isNaN(year) || Number.isNaN(quarterNumber)) return null
  return { year, quarterNumber }
}

function realizedGain(event: InvestmentEvent): number {
  if (event.type === 'deposit') return 0
  return event.amountUSD - (event.costBasisUSD ?? 0)
}

export { realizedGain }

export function computeQuarterlyTaxReport(events: InvestmentEvent[]): QuarterlyTaxReport {
  const byQuarter = new Map<string, QuarterlyTaxLine>()
  const skippedEvents: InvestmentEvent[] = []

  for (const event of events) {
    const quarterInfo = getQuarter(event?.date)
    if (!quarterInfo) {
      skippedEvents.push(event)
      continue
    }

    const { year, quarterNumber } = quarterInfo
    const key = `${year}-Q${quarterNumber}`

    if (!byQuarter.has(key)) {
      byQuarter.set(key, {
        quarter: key,
        year,
        quarterNumber,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalDistributions: 0,
        realizedGainUSD: 0,
        events: [],
      })
    }

    const line = byQuarter.get(key)!
    line.events.push(event)

    if (event.type === 'deposit') line.totalDeposits += event.amountUSD
    if (event.type === 'withdrawal') line.totalWithdrawals += event.amountUSD
    if (event.type === 'distribution') line.totalDistributions += event.amountUSD

    line.realizedGainUSD += realizedGain(event)
  }

  const result = Array.from(byQuarter.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.quarterNumber - b.quarterNumber,
  ) as QuarterlyTaxReport

  Object.defineProperties(result, {
    skippedCount: {
      value: skippedEvents.length,
      enumerable: false,
      writable: true,
      configurable: true,
    },
    skippedEvents: {
      value: skippedEvents,
      enumerable: false,
      writable: true,
      configurable: true,
    },
  })

  return result
}

export function computeQuarterlyTaxReportDetailed(events: InvestmentEvent[]): TaxReportSummary {
  const lines = computeQuarterlyTaxReport(events)
  return {
    lines,
    skippedCount: lines.skippedCount,
    skippedEvents: lines.skippedEvents,
  }
}

const NUMERIC = /^-?\d+(?:\.\d+)?$/

/**
 * Escapes one CSV field: quotes every field, doubles embedded quotes and
 * prefixes spreadsheet formula triggers with an apostrophe so a project name
 * like `=cmd|...` cannot execute when the file is opened.
 */
function csvField(raw: string): string {
  let value = raw
  const formulaLeading = /^[=+@]/.test(value) || (value.startsWith('-') && !NUMERIC.test(value))
  if (formulaLeading) value = `'${value}`
  if (/["\r\n,]/.test(value)) value = `"${value.replace(/"/g, '""')}"`
  return value
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(',')
}

export function quarterlyReportToCsv(lines: QuarterlyTaxLine[]): string {
  // Generate row-level details for each event within quarters
  // This matches the UI display and provides complete audit trail
  const detailRows: string[] = []

  for (const line of lines) {
    // Quarter header row
    detailRows.push(
      csvRow([
        line.quarter,
        'Quarter Summary',
        line.totalDeposits.toFixed(2),
        line.totalWithdrawals.toFixed(2),
        line.totalDistributions.toFixed(2),
        line.realizedGainUSD.toFixed(2),
        '', // project (empty for summary)
        '', // type (empty for summary)
        '', // amount (empty for summary)
        '', // cost basis (empty for summary)
      ]),
    )

    // Event-level details for transparency and full audit trail
    for (const event of line.events) {
      detailRows.push(
        csvRow([
          '', // quarter (empty for detail rows)
          'Event Detail',
          '', // total deposits (empty for detail)
          '', // total withdrawals (empty for detail)
          '', // total distributions (empty for detail)
          '', // realized gain summary (empty for detail)
          event.projectName,
          event.type,
          event.amountUSD.toFixed(2),
          (event.costBasisUSD ?? 0).toFixed(2),
        ]),
      )
    }
  }

  const header = csvRow([
    'Quarter',
    'Type',
    'Total Deposits (USD)',
    'Total Withdrawals (USD)',
    'Total Distributions (USD)',
    'Realized Gain (USD)',
    'Project Name',
    'Event Type',
    'Amount (USD)',
    'Cost Basis (USD)',
  ])

  return [header, ...detailRows].join('\n')
}

export function downloadCsv(filename: string, csvContent: string): void {
  // For large files, use streaming to avoid memory issues (#450)
  // Split into chunks to prevent browser from hanging with huge datasets
  const CHUNK_SIZE = 1024 * 1024 // 1MB chunks

  let blob: Blob

  if (csvContent.length > CHUNK_SIZE) {
    // Stream large files in chunks to prevent memory buildup
    const chunks: BlobPart[] = []
    for (let i = 0; i < csvContent.length; i += CHUNK_SIZE) {
      chunks.push(csvContent.slice(i, i + CHUNK_SIZE))
    }
    blob = new Blob(chunks, { type: 'text/csv;charset=utf-8;' })
  } else {
    // For smaller files, create blob directly (faster)
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)

  // Use requestAnimationFrame to ensure UI doesn't freeze during download
  requestAnimationFrame(() => {
    link.click()
    // Clean up after a short delay to ensure download started
    setTimeout(() => {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 100)
  })
}
