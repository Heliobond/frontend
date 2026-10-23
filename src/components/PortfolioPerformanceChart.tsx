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

function pathFor(values: number[]) {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100
      const y = 36 - ((value - min) / span) * 30
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

function Series({
  label,
  value,
  values,
  color,
  unit = '',
  historyLabel,
  locale,
}: {
  label: string
  value: number
  values: number[]
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
          d={pathFor(values)}
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

  useEffect(() => {
    let cancelled = false
    void apiFetch<unknown>(`/portfolio/${encodeURIComponent(address)}/performance`)
      .then((result) => {
        if (!cancelled) {
          const rows = Array.isArray(result) ? result.filter(isPoint) : []
          setPoints(rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)))
          setLoadedAddress(address)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPoints([])
          setLoadedAddress(address)
        }
      })
    return () => {
      cancelled = true
    }
  }, [address])

  const latest = points[points.length - 1]
  const loading = loadedAddress !== address
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
              color="var(--solar)"
              unit=" USDC"
            />
            <Series
              locale={locale}
              label={t('returns')}
              historyLabel={t('historyChartLabel', { label: t('returns') })}
              value={latest.returnPct}
              values={points.map((p) => p.returnPct)}
              color="var(--green, #24734b)"
              unit="%"
            />
            <Series
              locale={locale}
              label={t('yield')}
              historyLabel={t('historyChartLabel', { label: t('yield') })}
              value={latest.yieldPct}
              values={points.map((p) => p.yieldPct)}
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
        </>
      )}
    </section>
  )
}
