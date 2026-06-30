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
  // Each rung maps onto the shared type ladder (see tokens/typography.css):
  // value is the figure, label the caption, delta the signed change.
  const sizes: Record<StatBlockSize, { value: string; label: string; delta: string }> = {
    sm: { value: 'var(--type-h5)', label: 'var(--type-eyebrow)', delta: 'var(--type-caption)' },
    md: { value: 'var(--type-h2)', label: 'var(--type-caption)', delta: 'var(--type-small)' },
    lg: { value: 'var(--type-data-xl)', label: 'var(--type-small)', delta: 'var(--type-h4)' },
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
              fontSize: s.delta,
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
