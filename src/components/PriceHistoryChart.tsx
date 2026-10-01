import { memo } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkline } from './Sparkline'
import { formatDecimal } from '../lib/format'
import { selectPriceHistory } from '../state/selectors'
import type { PricePoint } from '../data/projectDetails'

/**
 * PriceHistoryChart — the bond's historical pricing (issue #406). Two quiet
 * ink sparklines — price (as % of par) and yield (%) — anchored by the latest
 * observation. Data comes from the flat `selectPriceHistory(id)` selector, so
 * no consumer drills into the nested detail model. SSR-safe: pure math from
 * the store. Renders nothing when a project has no recorded history yet.
 */
export interface PriceHistoryChartProps {
  projectId: number
}

const cardStyle: React.CSSProperties = {
  marginTop: 24,
  padding: '20px',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-sm)',
}

const captionStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-caption)',
  color: 'var(--ink-60)',
}

const seriesRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  marginTop: 12,
}

const seriesLabelStyle: React.CSSProperties = {
  minWidth: 56,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--type-caption)',
  color: 'var(--ink-60)',
}

const seriesValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontFeatureSettings: '"tnum" 1',
  fontWeight: 600,
  color: 'var(--ink)',
}

function delta(first: number, last: number): string {
  const diff = last - first
  const sign = diff >= 0 ? '+' : '−'
  return `${sign}${Math.abs(diff).toFixed(2)}`
}

export function PriceHistoryChart({ projectId }: PriceHistoryChartProps) {
  const t = useTranslations('PriceHistory')
  // Flat selector — one call, no nested-state drilling.
  const history: PricePoint[] = selectPriceHistory(projectId)
  if (history.length === 0) return null

  const last = history[history.length - 1]
  const first = history[0]

  return (
    <section style={cardStyle} aria-label={t('ariaLabel')}>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'var(--type-h4)',
          margin: 0,
          color: 'var(--ink)',
          letterSpacing: '-0.01em',
        }}
      >
        {t('title')}
      </h2>
      <p style={captionStyle}>
        {t('caption', {
          range: history.length > 1 ? `${first.date} – ${last.date}` : last.date,
        })}
      </p>

      <div style={seriesRowStyle}>
        <span style={seriesLabelStyle}>{t('priceLabel')}</span>
        <Sparkline
          points={history.map((p) => p.price)}
          aria-label={t('priceAriaLabel')}
          width={180}
          height={40}
        />
        <span style={seriesValueStyle}>
          {formatDecimal(last.price, 2)}
          {t('priceUnit')}
        </span>
        {history.length > 1 && (
          <span style={captionStyle}>
            {delta(first.price, last.price)} {t('since', { date: first.date })}
          </span>
        )}
      </div>

      <div style={seriesRowStyle}>
        <span style={seriesLabelStyle}>{t('yieldLabel')}</span>
        <Sparkline
          points={history.map((p) => p.yield)}
          aria-label={t('yieldAriaLabel')}
          width={180}
          height={40}
        />
        <span style={seriesValueStyle}>{last.yield.toFixed(2)}%</span>
        {history.length > 1 && (
          <span style={captionStyle}>
            {delta(first.yield, last.yield)}pp {t('since', { date: first.date })}
          </span>
        )}
      </div>
    </section>
  )
}

export default memo(PriceHistoryChart)
