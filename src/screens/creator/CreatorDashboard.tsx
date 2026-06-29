'use client'

import { type CSSProperties } from 'react'
import { StatBlock, ScoreGauge, Badge, Card, Sparkline } from '@/components'
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
        <Card style={{ padding: 22, height: '100%', boxSizing: 'border-box' }}>
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

        <Card style={{ padding: 22, height: '100%', boxSizing: 'border-box' }}>
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
              <Sparkline
                points={data.creditHistory}
                aria-label="Credit trend"
                width={96}
                height={26}
                color="var(--ink)"
                style={{ opacity: 0.55 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ScoreGauge value={data.greenScore} label="Green impact" size={96} stroke={8} />
              <Sparkline
                points={data.greenHistory}
                aria-label="Green trend"
                width={96}
                height={26}
                color="var(--ink)"
                style={{ opacity: 0.55 }}
              />
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
        <Card style={{ padding: 22, height: '100%', boxSizing: 'border-box' }}>
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

        <Card style={{ padding: 22, height: '100%', boxSizing: 'border-box' }}>
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
