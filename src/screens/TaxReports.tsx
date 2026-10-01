'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Card, DemoDataBadge } from '@/components'
import {
  computeQuarterlyTaxReport,
  quarterlyReportToCsv,
  downloadCsv,
  type InvestmentEvent,
} from '@/lib/tax-report'

// TODO: replace with the real investor history source (likely something in
// `src/data.ts` / `src/data/`, or the wallet/vault service) once wired up.
// Kept local and clearly-marked so this screen renders correctly today
// without depending on data shapes elsewhere in the app.
const PLACEHOLDER_EVENTS: InvestmentEvent[] = [
  { id: '1', projectName: 'Solar Farm A', date: '2025-01-10', type: 'deposit', amountUSD: 1000 },
  {
    id: '2',
    projectName: 'Solar Farm A',
    date: '2025-02-14',
    type: 'distribution',
    amountUSD: 45,
    costBasisUSD: 0,
  },
  { id: '3', projectName: 'Wind Co B', date: '2025-04-05', type: 'deposit', amountUSD: 500 },
  {
    id: '4',
    projectName: 'Solar Farm A',
    date: '2025-07-22',
    type: 'withdrawal',
    amountUSD: 300,
    costBasisUSD: 250,
  },
  {
    id: '5',
    projectName: 'Wind Co B',
    date: '2025-10-11',
    type: 'distribution',
    amountUSD: 30,
    costBasisUSD: 0,
  },
]

export function TaxReports() {
  const t = useTranslations('TaxReports')
  const [report] = useState(() => computeQuarterlyTaxReport(PLACEHOLDER_EVENTS))

  function handleExport() {
    const csv = quarterlyReportToCsv(report)
    downloadCsv(`heliobond-quarterly-tax-report-${new Date().getFullYear()}.csv`, csv)
  }

  return (
    <main id="main-content" style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 96px' }}>
      <DemoDataBadge style={{ marginBottom: 16 }} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--type-h3)',
            margin: 0,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          {t('title')}
        </h1>
        <Button variant="primary" size="md" onClick={handleExport}>
          {t('exportCsv')}
        </Button>
      </div>

      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-data)',
          lineHeight: 1.6,
          color: 'var(--ink-60)',
          margin: '0 0 28px',
        }}
      >
        {t('disclaimer')}
      </p>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--type-small)',
            }}
          >
            <thead>
              <tr style={{ background: 'var(--ink-06)' }}>
                <th
                  style={{
                    padding: '14px 20px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--ink-12)',
                  }}
                >
                  {t('columnQuarter')}
                </th>
                <th
                  style={{
                    padding: '14px 20px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--ink-12)',
                  }}
                >
                  {t('columnDeposits')}
                </th>
                <th
                  style={{
                    padding: '14px 20px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--ink-12)',
                  }}
                >
                  {t('columnWithdrawals')}
                </th>
                <th
                  style={{
                    padding: '14px 20px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--ink-12)',
                  }}
                >
                  {t('columnDistributions')}
                </th>
                <th
                  style={{
                    padding: '14px 20px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--ink-12)',
                  }}
                >
                  {t('columnRealizedGain')}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.map((line, index) => (
                <tr key={line.quarter}>
                  <td
                    style={{
                      padding: '14px 20px',
                      color: 'var(--ink)',
                      borderBottom: index < report.length - 1 ? '1px solid var(--ink-12)' : 'none',
                    }}
                  >
                    {line.quarter}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      textAlign: 'right',
                      color: 'var(--ink)',
                      fontFeatureSettings: '"tnum" 1',
                      borderBottom: index < report.length - 1 ? '1px solid var(--ink-12)' : 'none',
                    }}
                  >
                    {t('currencyFormat', { amount: line.totalDeposits.toFixed(2) })}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      textAlign: 'right',
                      color: 'var(--ink)',
                      fontFeatureSettings: '"tnum" 1',
                      borderBottom: index < report.length - 1 ? '1px solid var(--ink-12)' : 'none',
                    }}
                  >
                    {t('currencyFormat', { amount: line.totalWithdrawals.toFixed(2) })}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      textAlign: 'right',
                      color: 'var(--ink)',
                      fontFeatureSettings: '"tnum" 1',
                      borderBottom: index < report.length - 1 ? '1px solid var(--ink-12)' : 'none',
                    }}
                  >
                    {t('currencyFormat', { amount: line.totalDistributions.toFixed(2) })}
                  </td>
                  <td
                    style={{
                      padding: '14px 20px',
                      textAlign: 'right',
                      color: 'var(--ink)',
                      fontFeatureSettings: '"tnum" 1',
                      borderBottom: index < report.length - 1 ? '1px solid var(--ink-12)' : 'none',
                    }}
                  >
                    {t('currencyFormat', { amount: line.realizedGainUSD.toFixed(2) })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  )
}
