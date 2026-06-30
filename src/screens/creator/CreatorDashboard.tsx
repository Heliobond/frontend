'use client'

import { type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('Creator')
  const fundedPct =
    data.fundingGoal > 0 ? Math.round((data.fundingReceived / data.fundingGoal) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--type-h4)',
            margin: 0,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          {data.projectName}
        </h3>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-small)',
            color: 'var(--ink-60)',
          }}
        >
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
          <StatBlock label={t('dashFunding')} value={`$${data.fundingReceived.toLocaleString('en-US')}`} size="lg" />
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
                fontSize: 'var(--type-caption)',
                color: 'var(--ink-60)',
                marginTop: 8,
              }}
            >
              <span
                style={{ fontFamily: 'var(--font-data)', color: 'var(--ink)', fontWeight: 600 }}
              >
                {fundedPct}%
              </span>{' '}
              {t('dashGoalDeployed', { pct: fundedPct, goal: data.fundingGoal.toLocaleString('en-US') })}
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
            <h4 style={cardTitle}>{t('dashOracleScores')}</h4>
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--type-eyebrow)',
                color: 'var(--ink-40)',
              }}
            >
              {t('dashVerified', { ago: data.verifiedAgo })}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ScoreGauge value={data.creditScore} label={t('dashCreditLabel')} size={96} stroke={8} />
              <Sparkline series={data.creditHistory} label={t('dashCreditTrend')} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ScoreGauge value={data.greenScore} label={t('dashGreenLabel')} size={96} stroke={8} />
              <Sparkline series={data.greenHistory} label={t('dashGreenTrend')} />
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
          <h4 style={cardTitle}>{t('dashOracleEvalTitle')}</h4>
          <p style={{ ...subtle, margin: '0 0 16px' }}>
            {t('dashOracleEvalSub')}
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
                  {f.metric === 'green' ? t('dashMetricGreen') : t('dashMetricCredit')}
                </Badge>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--type-small)',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    {f.factor}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--type-caption)',
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
            <h4 style={cardTitle}>{t('dashUpdatesTitle')}</h4>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-40)' }}>
              {t('dashUpdatesLink')}
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

interface UpdateRowProps {
  update: OracleUpdate
  first: boolean
}

function UpdateRow({ update, first }: UpdateRowProps) {
  const t = useTranslations('Creator')
  const up = update.to >= update.from
  const metricKey = update.metric === 'green' ? 'dashMetricGreenLabel' : 'dashMetricCreditLabel'
  const metricLabel = t(metricKey)
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
            fontSize: 'var(--type-small)',
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
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-eyebrow)',
            color: 'var(--ink-60)',
          }}
        >
          {update.date}
        </div>
      </div>
      <a
        href="https://stellar.expert"
        target="_blank"
        rel="noreferrer"
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--type-eyebrow)',
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
  fontSize: 'var(--type-body-lg)',
  margin: 0,
  color: 'var(--ink)',
  letterSpacing: '-0.01em',
}
const subtle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-small)',
  lineHeight: 1.5,
  color: 'var(--ink-60)',
}