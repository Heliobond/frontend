import { type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { Badge, Button, ScoreGauge } from '../components'
import { Sparkline } from '../components/Sparkline'
import { type Project } from '../data'
import { type ProjectDetail as ProjectDetailData } from '../data/projectDetails'

const strong = (chunks: ReactNode) => <b style={{ color: 'var(--ink)' }}>{chunks}</b>

/**
 * ProjectDetail — the full story of one project the pool funds. Hero, the
 * creator's verification, two large sun-arc scores with their on-chain history,
 * the funding timeline, and an honest pooled-model CTA. You invest in the POOL,
 * which funds this project — this surface is a window, not a checkout.
 */
export interface ProjectDetailProps {
  project: Project
  detail: ProjectDetailData
  onInvest: () => void
  onBack?: () => void
}

export function ProjectDetail({ project, detail, onInvest, onBack }: ProjectDetailProps) {
  const t = useTranslations('ProjectDetail')
  return (
    <main id="main-content" style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 96px' }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            appearance: 'none',
            background: 'none',
            border: 'none',
            padding: '4px 0',
            margin: '0 0 20px',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink-60)',
          }}
        >
          <span aria-hidden="true">{t('backAriaHidden')}</span> {t('backLabel')}
        </button>
      )}

      {/* Hero band */}
      <section
        style={{
          position: 'relative',
          height: 280,
          borderRadius: 'var(--radius-card)',
          background: detail.heroGradient,
          border: '1px solid var(--ink-12)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
          marginBottom: 28,
        }}
      >
        {/* Creator verification, top area */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <Badge tone="growth" icon={<ShieldCheckIcon />}>
            {t('verifiedSince', { since: detail.creator.since })}
          </Badge>
        </div>

        {/* Project name, display font */}
        <h1
          style={{
            position: 'absolute',
            left: 24,
            top: 64,
            right: 24,
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: 'var(--ink)',
            maxWidth: 560,
          }}
        >
          {project.name}
        </h1>

        {/* Location pin chip, bottom-left */}
        <span
          style={{
            position: 'absolute',
            left: 16,
            bottom: 16,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 28,
            padding: '0 12px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface)',
            border: '1px solid var(--ink-12)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          <PinIcon /> {project.location}
        </span>
      </section>

      {/* Creator line + story */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13.5,
            color: 'var(--ink-60)',
            marginBottom: 10,
          }}
        >
          {t('builtBy')} <b style={{ color: 'var(--ink)' }}>{detail.creator.name}</b>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 17,
            lineHeight: 1.6,
            color: 'var(--ink-60)',
            margin: 0,
            maxWidth: 640,
          }}
        >
          {detail.story}
        </p>
      </div>

      {/* Two large sun-arc scores with history */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={sectionTitle}>{t('scoresTitle')}</h2>
        <div className="hb-detail-scores" style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <ScoreColumn
            value={project.credit}
            label={t('creditLabel')}
            history={detail.scoreHistory.credit.map((p) => p.value)}
            sparkLabel={t('creditHistory')}
            onChainNote={t('onChainNote')}
            verifiedAgo={t('verifiedAgo')}
          />
          <ScoreColumn
            value={project.green}
            label={t('greenLabel')}
            history={detail.scoreHistory.green.map((p) => p.value)}
            sparkLabel={t('greenHistory')}
            onChainNote={t('onChainNote')}
            verifiedAgo={t('verifiedAgo')}
          />
        </div>
      </section>

      {/* Funding timeline */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={sectionTitle}>{t('fundingTitle')}</h2>
        <div style={cardStyle}>
          {detail.fundingTimeline.map((event, i) => (
            <div
              key={event.hash}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                padding: '14px 0',
                borderTop: i ? '1px solid var(--ink-12)' : 'none',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  {event.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12.5,
                    color: 'var(--ink-60)',
                    marginTop: 2,
                  }}
                >
                  {event.date}
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontWeight: 600,
                    fontSize: 15,
                    color: 'var(--ink)',
                    fontFeatureSettings: '"tnum" 1',
                  }}
                >
                  {event.amount}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 12,
                    color: 'var(--ink-40)',
                    marginTop: 2,
                  }}
                >
                  {event.hash} ↗
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* This project's contribution + how it's calculated */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={sectionTitle}>{t('contributionTitle')}</h2>
        <div style={cardStyle}>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14.5,
              lineHeight: 1.6,
              color: 'var(--ink-60)',
              margin: '0 0 14px',
            }}
          >
            {t.rich('contributionBody', {
              b: (c) => <b style={{ color: 'var(--ink)' }}>{c}</b>,
              credit: project.credit,
              green: project.green,
            })}
          </p>
          <details style={{ borderTop: '1px solid var(--ink-12)', paddingTop: 14 }}>
            <summary
              style={{
                cursor: 'pointer',
                listStyle: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              {t('calcSummary')}
            </summary>
            <p
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--ink-60)',
                background: 'var(--ink-06)',
                borderRadius: 'var(--radius-input)',
                padding: '12px 14px',
                margin: '12px 0 0',
              }}
            >
              {t('calcFormula')}
            </p>
          </details>
        </div>
      </section>

      {/* Primary CTA — honest pooled framing */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button variant="primary" size="lg" onClick={onInvest} style={{ width: '100%' }}>
          {t('investCta')}
        </Button>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--ink-60)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {t('investNote')}
        </p>
        {onBack && (
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                appearance: 'none',
                background: 'none',
                border: 'none',
                padding: '6px 0',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink-60)',
              }}
            >
              <span aria-hidden="true">{t('backAriaHidden')}</span> {t('backLabel')}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

function ScoreColumn({
  value,
  label,
  history,
  sparkLabel,
  onChainNote,
  verifiedAgo,
}: {
  value: number
  label: string
  history: number[]
  sparkLabel: string
  onChainNote: string
  verifiedAgo: string
}) {
  const t = useTranslations('ProjectDetail')
  return (
    <div
      style={{
        flex: '1 1 240px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        padding: '24px 20px',
      }}
    >
      <ScoreGauge value={value} label={label} size={140} stroke={11} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Sparkline points={history} aria-label={sparkLabel} />
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--ink-40)',
            whiteSpace: 'nowrap',
          }}
        >
          {onChainNote}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--ink-40)',
            whiteSpace: 'nowrap',
          }}
        >
          {verifiedAgo}
        </span>
      </div>
    </div>
  )
}

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 19,
  letterSpacing: '-0.01em',
  color: 'var(--ink)',
  margin: '0 0 16px',
}

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-sm)',
  padding: '8px 22px',
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function ShieldCheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 5 6v5c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3Z" />
      <path d="m9 11.5 2 2 4-4.5" />
    </svg>
  )
}
