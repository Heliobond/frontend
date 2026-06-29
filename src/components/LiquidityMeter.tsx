import { type CSSProperties } from 'react'

/**
 * Heliobond LiquidityMeter — the platform's hardest honesty moment, made
 * ambient. Shows how much of the pool is liquid now vs working in projects,
 * with the "Available to withdraw now" figure permanently legible.
 */
export interface LiquidityMeterProps {
  liquid?: number
  total?: number
  currency?: string
  showExplanation?: boolean
  style?: CSSProperties
}

export function LiquidityMeter({
  liquid = 0,
  total = 0,
  currency = '$',
  showExplanation = true,
  style,
}: LiquidityMeterProps) {
  const pct = total > 0 ? Math.max(0, Math.min(1, liquid / total)) : 0
  const fmt = (n: number) =>
    currency + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

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
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--ink-60)' }}>
          Available to withdraw now
        </span>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontWeight: 600,
            fontSize: 16,
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
        aria-label="Share of pool liquid now"
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
            fontSize: 12.5,
            lineHeight: 1.5,
            color: 'var(--ink-60)',
            margin: '8px 0 0',
          }}
        >
          The pool holds {fmt(liquid)} liquid; the rest ({fmt(Math.max(0, total - liquid))}) is
          working in projects. You can withdraw up to {fmt(liquid)} today, or any part of it.
        </p>
      )}
    </div>
  )
}
