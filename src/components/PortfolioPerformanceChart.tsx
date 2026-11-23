'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { apiFetch } from '../lib/api'
import { formatDate, formatNumber } from '../lib/format'

export interface PortfolioPerformancePoint {
  timestamp: string
  valueUsdc: number
  returnPct: number
  yieldPct: number
}

function isPoint(value: unknown): value is PortfolioPerformancePoint {
  if (typeof value !== 'object' || value === null) return false
  const point = value as Record<string, unknown>
  return (
    typeof point.timestamp === 'string' &&
    Number.isFinite(Date.parse(point.timestamp)) &&
    typeof point.valueUsdc === 'number' &&
    Number.isFinite(point.valueUsdc) &&
    typeof point.returnPct === 'number' &&
    Number.isFinite(point.returnPct) &&
    typeof point.yieldPct === 'number' &&
    Number.isFinite(point.yieldPct)
  )
}

function pathFor(values: number[], timestamps: string[]) {
  if (values.length === 0) return ''

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  // Parse timestamps to milliseconds
  const times = timestamps.map((ts) => Date.parse(ts))
  const minTime = times[0]
  const maxTime = times[times.length - 1]
  const timeSpan = maxTime - minTime || 1 // Handle single point or equal timestamps

  return values
    .map((value, index) => {
      // For single point or equal timestamps, center at 50%
      const x = timeSpan === 1 ? 50 : ((times[index] - minTime) / timeSpan) * 100
      const y = 36 - ((value - min) / span) * 30
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

function Series({
  label,
  value,
  values,
  timestamps,
  color,
  unit = '',
  historyLabel,
  locale,
}: {
  label: string
  value: number
  values: number[]
  timestamps: string[]
  color: string
  unit?: string
  historyLabel: string
  locale: string
}) {
  return (
    <div style={{ minWidth: 0, flex: '1 1 190px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{label}</span>
        <strong>
          {formatNumber(value, { appLocale: locale, maximumFractionDigits: 2 })}
          {unit}
        </strong>
      </div>
      <svg
        viewBox="0 0 100 40"
        role="img"
        aria-label={historyLabel}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: 72, overflow: 'visible' }}
      >
        <path
          d={pathFor(values, timestamps)}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

/** Historical portfolio value, return and yield from the indexed performance API. */
export function PortfolioPerformanceChart({ address }: { address: string }) {
  const t = useTranslations('Components.PortfolioPerformanceChart')
  const locale = useLocale()
  const [points, setPoints] = useState<PortfolioPerformancePoint[]>([])
  const [loadedAddress, setLoadedAddress] = useState<string | null>(null)
  const [failedAddress, setFailedAddress] = useState<string | null>(null)
  const [showDataTable, setShowDataTable] = useState(false)

  const loadPerformance = (targetAddress: string) => {
    let cancelled = false
    void apiFetch<unknown>(`/portfolio/${encodeURIComponent(targetAddress)}/performance`)
      .then((result) => {
        if (!cancelled) {
          const rows = Array.isArray(result) ? result.filter(isPoint) : []
          setPoints(rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)))
          setLoadedAddress(targetAddress)
          setFailedAddress(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPoints([])
          setLoadedAddress(null)
          setFailedAddress(targetAddress)
        }
      })
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    return loadPerformance(address)
  }, [address])

  const latest = points[points.length - 1]
  const loading = loadedAddress !== address && failedAddress !== address
  const failed = failedAddress === address

  return (
    <section
      aria-labelledby="portfolio-performance-title"
      data-testid="portfolio-performance"
      style={{
        margin: '0 0 28px',
        padding: 22,
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--surface)',
      }}
    >
      <h2
        id="portfolio-performance-title"
        style={{
          margin: '0 0 16px',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--type-h4)',
        }}
      >
        {t('title')}
      </h2>
      {loading ? (
        <p aria-busy="true">{t('loading')}</p>
      ) : failed ? (
        <div role="alert">
          <p style={{ margin: '0 0 12px', color: 'var(--ink-60)' }}>{t('failed')}</p>
          <button
            type="button"
            onClick={() => loadPerformance(address)}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-button)',
              border: '1px solid var(--ink-20)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'var(--type-body)',
            }}
          >
            {t('retry')}
          </button>
        </div>
      ) : !latest ? (
        <p role="status" style={{ margin: 0, color: 'var(--ink-60)' }}>
          {t('empty')}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Series
              locale={locale}
              label={t('portfolioValue')}
              historyLabel={t('historyChartLabel', { label: t('portfolioValue') })}
              value={latest.valueUsdc}
              values={points.map((p) => p.valueUsdc)}
              timestamps={points.map((p) => p.timestamp)}
              color="var(--solar)"
              unit=" USDC"
            />
            <Series
              locale={locale}
              label={t('returns')}
              historyLabel={t('historyChartLabel', { label: t('returns') })}
              value={latest.returnPct}
              values={points.map((p) => p.returnPct)}
              timestamps={points.map((p) => p.timestamp)}
              color="var(--green, #24734b)"
              unit="%"
            />
            <Series
              locale={locale}
              label={t('yield')}
              historyLabel={t('historyChartLabel', { label: t('yield') })}
              value={latest.yieldPct}
              values={points.map((p) => p.yieldPct)}
              timestamps={points.map((p) => p.timestamp)}
              color="var(--blue, #3978a8)"
              unit="%"
            />
          </div>
          <p
            style={{ margin: '12px 0 0', color: 'var(--ink-60)', fontSize: 'var(--type-caption)' }}
          >
            {t('snapshotsNote', {
              start: formatDate(points[0].timestamp, locale),
              end: formatDate(latest.timestamp, locale),
            })}
          </p>

          {/* Accessible data table toggle */}
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setShowDataTable(!showDataTable)}
              aria-expanded={showDataTable}
              aria-controls="performance-data-table"
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-button)',
                border: '1px solid var(--ink-20)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'var(--type-body)',
              }}
            >
              {showDataTable ? t('hideDataTable') : t('showDataTable')}
            </button>
          </div>

          {/* Accessible chronological data table */}
          {showDataTable && (
            <div id="performance-data-table" style={{ marginTop: 16, overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 'var(--type-body)',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ink-12)' }}>
                    <th
                      scope="col"
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontWeight: 600,
                      }}
                    >
                      {t('dateColumn')}
                    </th>
                    <th
                      scope="col"
                      style={{
                        padding: '8px 12px',
                        textAlign: 'right',
                        fontWeight: 600,
                      }}
                    >
                      {t('portfolioValue')}
                    </th>
                    <th
                      scope="col"
                      style={{
                        padding: '8px 12px',
                        textAlign: 'right',
                        fontWeight: 600,
                      }}
                    >
                      {t('returns')}
                    </th>
                    <th
                      scope="col"
                      style={{
                        padding: '8px 12px',
                        textAlign: 'right',
                        fontWeight: 600,
                      }}
                    >
                      {t('yield')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point, index) => (
                    <tr
                      key={point.timestamp}
                      style={{
                        borderBottom: index < points.length - 1 ? '1px solid var(--ink-8)' : 'none',
                      }}
                    >
                      <td style={{ padding: '8px 12px' }}>{formatDate(point.timestamp, locale)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {formatNumber(point.valueUsdc, {
                          appLocale: locale,
                          maximumFractionDigits: 2,
                        })}{' '}
                        USDC
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {formatNumber(point.returnPct, {
                          appLocale: locale,
                          maximumFractionDigits: 2,
                        })}
                        %
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {formatNumber(point.yieldPct, {
                          appLocale: locale,
                          maximumFractionDigits: 2,
                        })}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
