import { type CSSProperties } from 'react'

/**
 * Heliobond ScoreGauge — the signature sun-arc meter. A 270° arc (gap at the
 * bottom) with a solar dot at the value. Renders the score as text too, so the
 * meaning never lives in the arc alone (a11y + color-blind safe).
 */
export interface ScoreGaugeProps {
  value?: number
  max?: number
  label?: string
  ariaValueLabel?: string
  size?: number
  stroke?: number
  showValue?: boolean
  verifiedAgo?: string
  verifiedLabel?: string
  explorerUrl?: string
  style?: CSSProperties
}

export function ScoreGauge({
  value = 0,
  max = 100,
  label,
  ariaValueLabel,
  size = 120,
  stroke = 9,
  showValue = true,
  verifiedAgo,
  verifiedLabel,
  explorerUrl,
  style,
}: ScoreGaugeProps) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - stroke / 2 - 2
  const C = 2 * Math.PI * r
  const fraction = Math.max(0, Math.min(1, value / max))

  const trackLen = 0.75 * C
  const valueLen = fraction * trackLen

  // dot at value angle: start 135deg, sweep 270deg clockwise (screen coords)
  const angle = (135 + fraction * 270) * (Math.PI / 180)
  const dotX = cx + r * Math.cos(angle)
  const dotY = cy + r * Math.sin(angle)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, ...style }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={ariaValueLabel ?? (label ? `${label}: ${value}/${max}` : `${value}/${max}`)}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--ink-12)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${trackLen} ${C - trackLen}`}
            transform={`rotate(135 ${cx} ${cy})`}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--solar)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${valueLen} ${C - valueLen}`}
            transform={`rotate(135 ${cx} ${cy})`}
          />
          <circle
            cx={dotX}
            cy={dotY}
            r={stroke * 0.78}
            fill="var(--solar)"
            stroke="var(--ink)"
            strokeWidth={2}
          />
        </svg>
        {showValue && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-data)',
              fontWeight: 600,
              fontSize: size * 0.22,
              color: 'var(--ink)',
            }}
          >
            {value}
          </div>
        )}
      </div>
      {label && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            color: 'var(--ink-60)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      )}
      {verifiedAgo &&
        (explorerUrl ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--type-fine)',
              color: 'var(--ink-40)',
              whiteSpace: 'nowrap',
              textDecoration: 'none',
            }}
          >
            {verifiedLabel ?? verifiedAgo} ↗
          </a>
        ) : (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--type-fine)',
              color: 'var(--ink-40)',
              whiteSpace: 'nowrap',
            }}
          >
            {verifiedLabel ?? verifiedAgo}
          </span>
        ))}
    </div>
  )
}
