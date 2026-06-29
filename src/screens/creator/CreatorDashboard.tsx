'use client'

import { type CSSProperties, type ReactNode } from 'react'
import { StatBlock, ScoreGauge, Badge } from '@/components'
import {
  CREATOR_DASHBOARD,
  type CreatorDashboard as CreatorDashboardModel,
  type OracleUpdate,
} from '@/data/creator'

/**
 * CreatorDashboard — the creator's calm read on their project. Funding received,
 * the two live oracle scores, tiny score-history sparklines, an honest "what the
 * oracle evaluates" panel so the path to a better score is never mysterious, and
 * a feed of recent oracle updates that each link to the Stellar explorer.
 */
export interface CreatorDashboardProps {
  data?: CreatorDashboardModel
}

export function CreatorDashboard({ data = CREATOR_DASHBOARD }: CreatorDashboardProps) {
  const fundedPct =
    data.fundingGoal > 0 ? Math.round((data.fundingReceived / data.fundingGoal) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 20,
            margin: 0,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          {data.projectName}
        </h3>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--ink-60)' }}>
          {data.location}
        </span>
      </div>

      {/* Top row — funding + the two scores */}
      <div
        style={{
          display: 'grid',
          gap: 24,
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          alignItems: 'stretch',
        }}
      >
        <Card>
          <StatBlock
            label="Funding received from the pool"
            value={`$${data.fundingReceived.toLocaleString('en-US')}`}
            size="lg"
          />
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                height: 8,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--ink-06)',
                border: '1px solid var(--ink-12)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, fundedPct)}%`,
                  height: '100%',
                  background: 'var(--solar)',
                }}
              />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12.5,
                color: 'var(--ink-60)',
                marginTop: 8,
              }}
            >
              <span
                style={{ fontFamily: 'var(--font-data)', color: 'var(--ink)', fontWeight: 600 }}
              >
                {fundedPct}%
              </span>{' '}
              of your ${data.fundingGoal.toLocaleString('en-US')} goal deployed.
            </div>
          </div>
        </Card>

        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <h4 style={cardTitle}>Oracle scores</h4>
            <span
              style={{ fontFamily: 'var(--font-data)', fontSize: 11.5, color: 'var(--ink-40)' }}
            >
              verified {data.verifiedAgo}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ScoreGauge value={data.creditScore} label="Credit quality" size={96} stroke={8} />
              <Sparkline series={data.creditHistory} label="Credit trend" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ScoreGauge value={data.greenScore} label="Green impact" size={96} stroke={8} />
              <Sparkline series={data.greenHistory} label="Green trend" />
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom row — what the oracle evaluates + recent updates */}
      <div
        style={{
          display: 'grid',
          gap: 24,
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          alignItems: 'start',
        }}
      >
        <Card>
          <h4 style={cardTitle}>What the oracle evaluates</h4>
          <p style={{ ...subtle, margin: '0 0 16px' }}>
            Your scores are not a black box. These are the factors the oracle weighs — improve them
            and your scores follow.
          </p>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {data.oracleFactors.map((f) => (
              <li key={f.factor} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Badge tone={f.metric === 'green' ? 'growth' : 'neutral'}>
                  {f.metric === 'green' ? 'Green' : 'Credit'}
                </Badge>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    {f.factor}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: 'var(--ink-60)',
                      lineHeight: 1.45,
                      marginTop: 2,
                    }}
                  >
                    {f.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h4 style={cardTitle}>Recent oracle updates</h4>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-40)' }}>
              each → Stellar Expert
            </span>
          </div>
          {data.recentUpdates.map((u, i) => (
            <UpdateRow key={u.tx} update={u} first={i === 0} />
          ))}
        </Card>
      </div>
    </div>
  )
}

function UpdateRow({ update, first }: { update: OracleUpdate; first: boolean }) {
  const up = update.to >= update.from
  const metricLabel = update.metric === 'green' ? 'green' : 'credit'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderTop: first ? 'none' : '1px solid var(--ink-12)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 13.5,
            color: 'var(--ink)',
            fontFeatureSettings: '"tnum" 1',
          }}
        >
          {metricLabel} {update.from}{' '}
          <span aria-hidden="true" style={{ color: 'var(--ink-40)' }}>
            →
          </span>{' '}
          {update.to}{' '}
          <span style={{ color: up ? 'var(--growth)' : 'var(--ember)', fontWeight: 600 }}>
            {up ? '↑' : '↓'}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-60)' }}>
          {update.date}
        </div>
      </div>
      <a
        href="https://stellar.expert"
        target="_blank"
        rel="noreferrer"
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 12,
          color: 'var(--ink-40)',
          whiteSpace: 'nowrap',
          textDecoration: 'none',
        }}
      >
        {update.tx} ↗
      </a>
    </div>
  )
}

/** A minimal, self-built inline SVG sparkline — no external component. */
function Sparkline({ series, label }: { series: readonly number[]; label: string }) {
  const w = 96
  const h = 26
  const pad = 2
  if (series.length < 2) return null
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const step = (w - pad * 2) / (series.length - 1)
  const points = series.map((v, i) => {
    const x = pad + i * step
    const y = pad + (h - pad * 2) * (1 - (v - min) / span)
    return [x, y] as const
  })
  const d = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const last = points[points.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path
        d={d}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={2.6}
        fill="var(--solar)"
        stroke="var(--ink)"
        strokeWidth={1}
      />
    </svg>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        padding: 22,
        boxShadow: 'var(--shadow-sm)',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  )
}

const cardTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 17,
  margin: 0,
  color: 'var(--ink)',
  letterSpacing: '-0.01em',
}
const subtle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13.5,
  lineHeight: 1.5,
  color: 'var(--ink-60)',
}
