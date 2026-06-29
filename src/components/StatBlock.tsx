import { type CSSProperties } from 'react'

/**
 * Heliobond StatBlock — a labeled figure with optional signed delta. Money uses
 * mono with the integer at full weight and decimals at ink-60; deltas always
 * carry a sign + arrow so color is never the sole carrier.
 */
export type StatBlockSize = 'sm' | 'md' | 'lg'

export interface StatBlockProps {
  label: string
  value: string
  /** Fractional tail rendered dimmer than the integer part, e.g. ".55". */
  decimals?: string
  delta?: string
  deltaDirection?: 'up' | 'down'
  unit?: string
  size?: StatBlockSize
  href?: string
  style?: CSSProperties
}

export function StatBlock({
  label,
  value,
  decimals,
  delta,
  deltaDirection,
  unit,
  size = 'md',
  href,
  style,
}: StatBlockProps) {
  const sizes: Record<StatBlockSize, { value: number; label: number }> = {
    sm: { value: 18, label: 12 },
    md: { value: 28, label: 13 },
    lg: { value: 40, label: 13.5 },
  }
  const s = sizes[size] ?? sizes.md

  const dir = deltaDirection || (delta && delta.trim().startsWith('-') ? 'down' : 'up')
  const arrow = dir === 'down' ? '↓' : '↑'
  const deltaColor = dir === 'down' ? 'var(--ember)' : 'var(--growth)'

  const wrapperStyle: CSSProperties = { display: 'block', textDecoration: 'none', ...style }
  const inner = (
    <>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: s.label,
          color: 'var(--ink-60)',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {label}
        {href && (
          <span style={{ color: 'var(--ink-40)' }} aria-hidden="true">
            ↗
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontWeight: 600,
            fontSize: s.value,
            color: 'var(--ink)',
            fontFeatureSettings: '"tnum" 1',
            lineHeight: 1.05,
          }}
        >
          {value}
          {decimals != null && <span style={{ color: 'var(--ink-60)' }}>{decimals}</span>}
          {unit && (
            <span style={{ fontSize: '0.55em', color: 'var(--ink-60)', marginLeft: 4 }}>
              {unit}
            </span>
          )}
        </span>
        {delta && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontWeight: 600,
              fontSize: Math.max(13, s.value * 0.5),
              color: deltaColor,
              whiteSpace: 'nowrap',
            }}
          >
            {arrow} {delta}
          </span>
        )}
      </div>
    </>
  )

  return href ? (
    <a href={href} target="_blank" rel="noreferrer" style={wrapperStyle}>
      {inner}
    </a>
  ) : (
    <div style={wrapperStyle}>{inner}</div>
  )
}
