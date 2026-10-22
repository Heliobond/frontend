import { type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import PropTypes from 'prop-types'
import { formatMoney } from '@/lib/format'

/**
 * Heliobond LiquidityMeter — the platform's hardest honesty moment, made
 * ambient. Shows how much of the pool is liquid now vs working in projects,
 * with the "Available to withdraw now" figure permanently legible.
 */
export interface LiquidityMeterProps {
  /** The liquid/available amount currently in the vault for immediate withdrawal. Defaults to 0. */
  liquid?: number
  /** The total vault value (liquid + locked in active projects). Defaults to 0. */
  total?: number
  /** Currency symbol prefix (e.g. "$"). Defaults to "$". */
  currency?: string
  /** Whether to show the explanatory text detailing immediate liquidity vs active project allocation. Defaults to true. */
  showExplanation?: boolean
  /** Custom inline style overrides. */
  style?: CSSProperties
}

export function LiquidityMeter({
  liquid = 0,
  total = 0,
  currency = '$',
  showExplanation = true,
  style,
}: LiquidityMeterProps) {
  const t = useTranslations('Components.LiquidityMeter')
  const pct = total > 0 ? Math.max(0, Math.min(1, liquid / total)) : 0
  const fmt = (n: number) => formatMoney(n, { includeSymbol: true, symbol: currency })

  return (
    <div style={{ ...style }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-small)',
            color: 'var(--ink-60)',
          }}
        >
          {t('availableToWithdraw')}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontWeight: 600,
            fontSize: 'var(--type-body)',
            color: 'var(--ink)',
          }}
        >
          {fmt(liquid)}
        </span>
      </div>
      <div
        role="meter"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('liquidShareLabel')}
        style={{
          position: 'relative',
          height: 10,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--ink-06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${pct * 100}%`,
            background: 'var(--solar)',
            borderRadius: 'var(--radius-pill)',
          }}
        />
      </div>
      {showExplanation && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            lineHeight: 1.5,
            color: 'var(--ink-60)',
            margin: '8px 0 0',
          }}
        >
          {t('poolExplanation', {
            liquid: fmt(liquid),
            locked: fmt(Math.max(0, total - liquid)),
          })}
        </p>
      )}
    </div>
  )
}

LiquidityMeter.propTypes = {
  liquid: PropTypes.number,
  total: PropTypes.number,
  currency: PropTypes.string,
  showExplanation: PropTypes.bool,
  style: PropTypes.object,
}
