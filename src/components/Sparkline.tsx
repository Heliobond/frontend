import { type CSSProperties } from 'react'

/**
 * Heliobond Sparkline — a tiny presentational trend line. The path is drawn in
 * ink (it reads as the data, not decoration); only the last point gets a solar
 * dot, marking "now" — so the accent is a single highlight, never the line
 * itself. SSR-safe and hookless: pure math from props.
 */
export interface SparklineProps {
  points: number[]
  width?: number
  height?: number
  /** Stroke color for the line. Defaults to a quiet ink. */
  color?: string
  'aria-label'?: string
  style?: CSSProperties
}

export function Sparkline({
  points,
  width = 132,
  height = 36,
  color = 'var(--ink-40)',
  'aria-label': ariaLabel,
  style,
}: SparklineProps) {
  // Pad so the stroke and the solar dot never clip at the edges.
  const pad = 4
  const innerW = Math.max(1, width - pad * 2)
  const innerH = Math.max(1, height - pad * 2)

  const n = points.length
  const min = n ? Math.min(...points) : 0
  const max = n ? Math.max(...points) : 1
  const span = max - min || 1 // avoid divide-by-zero on a flat line

  const coords = points.map((value, i) => {
    const x = pad + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
    // higher value sits higher on screen (smaller y)
    const y = pad + (1 - (value - min) / span) * innerH
    return { x, y }
  })

  const polyPoints = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')
  const last = coords[coords.length - 1]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block', ...style }}
    >
      {n > 1 && (
        <polyline
          points={polyPoints}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r={3}
          fill="#FFB400"
          stroke="var(--surface)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  )
}

export default Sparkline
