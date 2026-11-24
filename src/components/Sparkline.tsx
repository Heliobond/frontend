import { memo, type CSSProperties } from 'react'

/**
 * Heliobond Sparkline — a tiny presentational trend line. The path is drawn in
 * ink (it reads as the data, not decoration); only the last point gets a solar dot,
 * marking "now" — so the accent is a single highlight, never the line
 * itself. SSR-safe and hookless: pure math from props.
 */
export interface SparklineProps {
  points: readonly number[]
  width?: number
  height?: number
  /** Stroke color for the line. Defaults to a quiet ink. */
  color?: string
  'aria-label'?: string
  style?: CSSProperties
}

const MAX_RENDERED_POINTS = 120

/** Select both extrema per bucket, in their original order and position. */
function sampleIndices(points: readonly number[]): number[] {
  if (points.length <= MAX_RENDERED_POINTS) return points.map((_, index) => index)
  const buckets = (MAX_RENDERED_POINTS - 2) / 2
  const interior = points.length - 2
  const indices = [0]
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = 1 + Math.floor((bucket * interior) / buckets)
    const end = 1 + Math.floor(((bucket + 1) * interior) / buckets)
    let low = start
    let high = start
    for (let i = start + 1; i < end; i++) {
      if (points[i] < points[low]) low = i
      if (points[i] > points[high]) high = i
    }
    indices.push(Math.min(low, high))
    if (low !== high) indices.push(Math.max(low, high))
  }
  indices.push(points.length - 1)
  return indices
}

function Sparkline({
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

  const samples = sampleIndices(points)
  const n = samples.length
  let min = points[0] ?? 0
  let max = points[0] ?? 1
  for (const index of samples) {
    min = Math.min(min, points[index])
    max = Math.max(max, points[index])
  }
  const span = max - min || 1 // avoid divide-by-zero on a flat line

  const coords = samples.map((index) => {
    const value = points[index]
    const x = pad + (n > 1 ? (index / (points.length - 1)) * innerW : innerW / 2)
    // higher value sits higher on screen (smaller y)
    const y = pad + (n > 1 ? (1 - (value - min) / span) * innerH : innerH / 2)
    return { index, value, x, y }
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
        <>
          <polygon
            points={`${pad},${height - pad} ${polyPoints} ${width - pad},${height - pad}`}
            fill={color}
            opacity={0.15}
          />
          <polyline
            points={polyPoints}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r={3}
          fill="var(--solar)"
          stroke="var(--canvas)"
          strokeWidth={1.5}
        >
          <title>{last.value}</title>
        </circle>
      )}
      {coords.map(({ index, value, x, y }) => (
        <circle key={index} cx={x} cy={y} r={6} fill="transparent">
          <title>{value}</title>
        </circle>
      ))}
    </svg>
  )
}

function areEqual(prevProps: SparklineProps, nextProps: SparklineProps): boolean {
  return (
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.color === nextProps.color &&
    prevProps['aria-label'] === nextProps['aria-label'] &&
    prevProps.style === nextProps.style &&
    prevProps.points.length === nextProps.points.length &&
    prevProps.points.every((value, index) => value === nextProps.points[index])
  )
}

const MemoizedSparkline = memo(Sparkline, areEqual)

export { MemoizedSparkline as Sparkline }
export default MemoizedSparkline
