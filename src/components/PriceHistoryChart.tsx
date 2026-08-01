import { type CSSProperties } from 'react'

/**
 * PriceHistoryChart — SVG line chart showing mock bond price/yield
 * history over time. Styled to match the Heliobond ink/solar design system.
 * Uses pure SVG (no chart library dependency) following the Sparkline pattern.
 */
export interface PricePoint {
  date: string
  /** Projected annual yield in percent */
  yield: number
  /** Bond unit price in USD */
  price: number
}

export interface PriceHistoryChartProps {
  points: readonly PricePoint[]
  width?: number
  height?: number
  'aria-label'?: string
  style?: CSSProperties
}

export function PriceHistoryChart({
  points,
  width = 640,
  height = 220,
  'aria-label': ariaLabel,
  style,
}: PriceHistoryChartProps) {
  const pad = { top: 20, right: 20, bottom: 30, left: 50 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const n = points.length
  if (n < 2) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-small)',
          color: 'var(--ink-40)',
          ...style,
        }}
      >
        Not enough data
      </div>
    )
  }

  const yields = points.map((p) => p.yield)
  const yMin = Math.min(...yields) - 0.5
  const yMax = Math.max(...yields) + 0.5
  const ySpan = yMax - yMin || 1

  const xCoords = points.map(
    (_, i) => pad.left + ((i / (n - 1)) * innerW),
  )
  const yCoords = yields.map(
    (v) => pad.top + ((1 - (v - yMin) / ySpan) * innerH),
  )

  const yieldLine = points
    .map(
      (_, i) =>
        `${i === 0 ? 'M' : 'L'}${xCoords[i].toFixed(1)},${yCoords[i].toFixed(1)}`,
    )
    .join(' ')

  // Area polygon: yield line + bottom edge
  const areaPoints =
    `${xCoords[0]},${pad.top + innerH} ` +
    points.map((_, i) => `${xCoords[i].toFixed(1)},${yCoords[i].toFixed(1)}`).join(' ') +
    ` ${xCoords[n - 1]},${pad.top + innerH}`

  // Grid: 5 horizontal lines
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(
    (frac) => pad.top + (1 - frac) * innerH,
  )

  const yLabels = [
    { v: yMin, y: pad.top + innerH },
    { v: yMin + ySpan * 0.5, y: pad.top + innerH * 0.5 },
    { v: yMax, y: pad.top },
  ].map((l) => ({ label: l.v.toFixed(1) + '%', y: l.y }))

  const xLabelStep = Math.max(1, Math.ceil(n / 6))

  return (
    <div style={{ position: 'relative', maxWidth: width, ...style }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {/* Grid lines */}
        {gridYs.map((gy, i) => (
          <line
            key={i}
            x1={pad.left}
            y1={gy}
            x2={width - pad.right}
            y2={gy}
            stroke="var(--ink-12)"
            strokeWidth={1}
            strokeDasharray={i === 0 || i === gridYs.length - 1 ? undefined : '4,4'}
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((lbl, i) => (
          <text
            key={i}
            x={pad.left - 8}
            y={lbl.y + 4}
            textAnchor="end"
            fill="var(--ink-40)"
            fontFamily="var(--font-data)"
            fontSize={11}
          >
            {lbl.label}
          </text>
        ))}

        {/* X-axis labels */}
        {points.map((p, i) => {
          if (i % xLabelStep !== 0 && i !== n - 1) return null
          return (
            <text
              key={i}
              x={xCoords[i]}
              y={height - 8}
              textAnchor="middle"
              fill="var(--ink-40)"
              fontFamily="var(--font-data)"
              fontSize={11}
            >
              {p.date}
            </text>
          )
        })}

        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill="var(--solar-06)"
          stroke="none"
        />

        {/* Yield line */}
        <path
          d={yieldLine}
          fill="none"
          stroke="var(--solar)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xCoords[i]}
            cy={yCoords[i]}
            r={i === n - 1 ? 4 : 2.5}
            fill={i === n - 1 ? 'var(--solar)' : 'var(--surface)'}
            stroke="var(--solar)"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          justifyContent: 'center',
          marginTop: 4,
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          color: 'var(--ink-60)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 3, background: 'var(--solar)', borderRadius: 2, display: 'inline-block' }} />
          Projected yield
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 3, background: 'var(--ink-40)', borderRadius: 2, display: 'inline-block' }} />
          Unit price
        </span>
      </div>
    </div>
  )
}

export default PriceHistoryChart
