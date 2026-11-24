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
  /** Cost basis allocated to this event. 0/undefined for deposits or when unavailable. */
  costBasisUSD?: number
  /** Indicates whether the cost basis is known, unavailable, or estimated. */
  costBasisStatus?: 'known' | 'unavailable' | 'estimated'
}

export interface QuarterlyTaxLine {
  quarter: string // e.g. "2025-Q1"
  year: number
  quarterNumber: 1 | 2 | 3 | 4
  totalDeposits: number
  totalWithdrawals: number
  totalDistributions: number
  realizedGainUSD: number | null
  hasUnavailableBasis?: boolean
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

const ACTIVITY_AMOUNT = /^[+-]?\$?((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)(?:\s+(?:USD|USDC))?$/i

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

    const amount: unknown = item.amount
    const digits = typeof amount === 'string' ? ACTIVITY_AMOUNT.exec(amount.trim())?.[1] : undefined
    const amountUSD =
      typeof amount === 'number' ? Math.abs(amount) : Number(digits?.replace(/,/g, ''))

    const itemWithBasis = item as Activity & {
      costBasisUSD?: number
      costBasis?: string | number
      basis?: string | number
    }

    let costBasisUSD: number | undefined
    let costBasisStatus: 'known' | 'unavailable' | 'estimated' | undefined

    if (itemWithBasis.costBasisUSD !== undefined && itemWithBasis.costBasisUSD !== null) {
      costBasisUSD = Number(itemWithBasis.costBasisUSD)
      costBasisStatus = 'known'
    } else if (itemWithBasis.costBasis !== undefined && itemWithBasis.costBasis !== null) {
      const parsedBasis =
        typeof itemWithBasis.costBasis === 'string'
          ? itemWithBasis.costBasis.replace(/[^0-9.-]+/g, '')
          : itemWithBasis.costBasis
      costBasisUSD = Number.parseFloat(String(parsedBasis))
      if (Number.isNaN(costBasisUSD)) {
        costBasisUSD = undefined
        costBasisStatus = 'unavailable'
      } else {
        costBasisStatus = 'known'
      }
    } else if (itemWithBasis.basis !== undefined && itemWithBasis.basis !== null) {
      const parsedBasis =
        typeof itemWithBasis.basis === 'string'
          ? itemWithBasis.basis.replace(/[^0-9.-]+/g, '')
          : itemWithBasis.basis
      costBasisUSD = Number.parseFloat(String(parsedBasis))
      if (Number.isNaN(costBasisUSD)) {
        costBasisUSD = undefined
        costBasisStatus = 'unavailable'
      } else {
        costBasisStatus = 'known'
      }
    } else if (type === 'deposit' || type === 'distribution') {
      costBasisUSD = 0
      costBasisStatus = 'known'
    } else {
      costBasisUSD = undefined
      costBasisStatus = 'unavailable'
    }

    events.push({
      id: item.hash || `${type}-${item.when}-${amountUSD}-${events.length}`,
      projectName: 'Heliobond Vault',
      date: item.when,
      type,
      amountUSD,
      costBasisUSD,
      costBasisStatus,
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

function realizedGain(event: InvestmentEvent): number | null {
  if (event.type === 'deposit') return 0
  if (
    event.type === 'withdrawal' &&
    (event.costBasisUSD === undefined || event.costBasisStatus === 'unavailable')
  ) {
    return null
  }
  return event.amountUSD - (event.costBasisUSD ?? 0)
}

export { realizedGain }

export function computeQuarterlyTaxReport(events: InvestmentEvent[]): QuarterlyTaxReport {
  const byQuarter = new Map<string, QuarterlyTaxLine>()
  const skippedEvents: InvestmentEvent[] = []

  for (const event of events) {
    const quarterInfo = getQuarter(event?.date)
    if (!quarterInfo || !Number.isFinite(event.amountUSD)) {
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
        hasUnavailableBasis: false,
        events: [],
      })
    }

    const line = byQuarter.get(key)!
    line.events.push(event)

    if (event.type === 'deposit') line.totalDeposits += event.amountUSD
    if (event.type === 'withdrawal') line.totalWithdrawals += event.amountUSD
    if (event.type === 'distribution') line.totalDistributions += event.amountUSD

    const gain = realizedGain(event)
    if (gain === null) {
      line.hasUnavailableBasis = true
      line.realizedGainUSD = null
    } else if (!line.hasUnavailableBasis && line.realizedGainUSD !== null) {
      line.realizedGainUSD += gain
    }
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

/**
 * Builds the export filename from the quarters included in the report.
 * The label never depends on the current date, so historical exports retain
 * the year of the activity they contain. Empty reports are labelled as
 * covering all periods because there is no quarter from which to derive one.
 */
export function quarterlyReportFilename(lines: readonly QuarterlyTaxLine[]): string {
  if (lines.length === 0) {
    return 'heliobond-quarterly-tax-report-all-periods.csv'
  }

  let first = lines[0]
  let last = lines[0]

  for (const line of lines) {
    if (
      line.year < first.year ||
      (line.year === first.year && line.quarterNumber < first.quarterNumber)
    ) {
      first = line
    }
    if (
      line.year > last.year ||
      (line.year === last.year && line.quarterNumber > last.quarterNumber)
    ) {
      last = line
    }
  }

  const start = `${first.year}-Q${first.quarterNumber}`
  const end = `${last.year}-Q${last.quarterNumber}`
  const period =
    start === end
      ? start
      : first.year === last.year
        ? `${start}-Q${last.quarterNumber}`
        : `${start}-to-${end}`

  return `heliobond-quarterly-tax-report-${period}.csv`
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
        line.realizedGainUSD !== null ? line.realizedGainUSD.toFixed(2) : 'Unavailable',
        '', // project (empty for summary)
        '', // type (empty for summary)
        '', // amount (empty for summary)
        '', // cost basis (empty for summary)
        '',
        '', // event date/id (empty for summary)
      ]),
    )

    // Event-level details for transparency and full audit trail
    for (const event of line.events) {
      const isBasisUnavailable =
        event.type === 'withdrawal' &&
        (event.costBasisUSD === undefined || event.costBasisStatus === 'unavailable')
      detailRows.push(
        csvRow([
          line.quarter,
          'Event Detail',
          '', // total deposits (empty for detail)
          '', // total withdrawals (empty for detail)
          '', // total distributions (empty for detail)
          '', // realized gain summary (empty for detail)
          event.projectName,
          event.type,
          event.amountUSD.toFixed(2),
          isBasisUnavailable ? 'Unavailable' : (event.costBasisUSD ?? 0).toFixed(2),
          event.date,
          event.id,
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
    'Event Date',
    'Event ID',
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
