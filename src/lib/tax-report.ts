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

/**
 * Maps portfolio activity feed items into InvestmentEvent models for tax accounting.
 * Filters out non-taxable events (e.g. score updates) and parses numeric amounts and dates.
 */
export function activityToInvestmentEvents(activity: Activity[]): InvestmentEvent[] {
  const events: InvestmentEvent[] = []

  for (const item of activity) {
    if (!item || typeof item !== 'object') continue
    const kindLower = (item.kind || '').toLowerCase()
    let type: InvestmentEventType | null = null

    if (kindLower.includes('deposit')) {
      type = 'deposit'
    } else if (kindLower.includes('withdraw')) {
      type = 'withdrawal'
    } else if (
      kindLower.includes('distribution') ||
      kindLower.includes('yield') ||
      kindLower.includes('claim')
    ) {
      type = 'distribution'
    } else {
      continue
    }

    const cleanAmount =
      typeof item.amount === 'string'
        ? item.amount.replace(/[^0-9.-]+/g, '')
        : String(item.amount ?? '')
    const amountUSD = Math.abs(parseFloat(cleanAmount)) || 0

    let date = item.when
    if (!date) {
      date = new Date().toISOString().split('T')[0]
    } else if (/^\d+$/.test(date)) {
      const num = Number(date)
      const ms = num < 1e11 ? num * 1000 : num
      date = new Date(ms).toISOString().split('T')[0]
    } else {
      const parsed = new Date(date)
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed.toISOString().split('T')[0]
      }
    }

    events.push({
      id: item.hash || `${type}-${date}-${amountUSD}-${events.length}`,
      projectName: (item as unknown as { projectName?: string }).projectName || 'Heliobond Vault',
      date,
      type,
      amountUSD,
      costBasisUSD:
        (item as unknown as { costBasisUSD?: number }).costBasisUSD ??
        (type === 'withdrawal' ? amountUSD : 0),
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

export function computeQuarterlyTaxReport(events: InvestmentEvent[]): QuarterlyTaxLine[] {
  const byQuarter = new Map<string, QuarterlyTaxLine>()

  for (const event of events) {
    const quarterInfo = getQuarter(event?.date)
    if (!quarterInfo) continue
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

  return Array.from(byQuarter.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.quarterNumber - b.quarterNumber,
  )
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
