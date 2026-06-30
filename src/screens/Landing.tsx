'use client'

import { useTranslations } from 'next-intl'
import { Button, StatBlock } from '../components'
import { LiveHelio } from '../brand/LiveHelio'
import { HB_DATA } from '../data'
import type { Screen } from '../types'

/**
 * Landing — public hero. The live Helio dominates; three counters deep-link to
 * on-chain proof. Thesis in display type, sentence case, from one dollar.
 */
export interface LandingProps {
  onConnect: () => void
  onNav: (screen: Screen) => void
}

export function Landing({ onConnect, onNav }: LandingProps) {
  const t = useTranslations('Landing')
  const d = HB_DATA
  const steps = [1, 2, 3, 4] as const
  const intensity = Math.min(1, d.pool.totalAssets / 6_000_000)

  return (
    <main id="main-content">
      {/* Hero */}
      <section
        className="hb-hero-grid hb-rise"
        style={{ maxWidth: 1320, margin: '0 auto', padding: '64px 32px 40px' }}
      >
        <div>
          <div className="hb-eyebrow" style={{ marginBottom: 20 }}>
            {t('eyebrow')}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(2.6rem, 5.4vw, 4.6rem)',
              lineHeight: 0.99,
              letterSpacing: '-0.02em',
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {t('title')}
            <span style={{ color: 'var(--ink-60)' }}>{t('titleAccent')}</span>
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 19,
              lineHeight: 1.5,
              color: 'var(--ink-60)',
              maxWidth: 520,
              margin: '22px 0 32px',
            }}
          >
            {t('sub')}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" size="lg" onClick={onConnect}>
              {t('ctaStart')}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => onNav('explore')}>
              {t('ctaExplore')}
            </Button>
          </div>
        </div>

        <div className="hb-hero-helio" style={{ display: 'flex', justifyContent: 'center' }}>
          <LiveHelio size={380} motes={d.pool.projectsFunded} intensity={intensity} />
        </div>
      </section>

      {/* Live counters */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '8px 32px 64px' }}>
        <div
          className="hb-counter-grid"
          style={{
            background: 'var(--ink-12)',
            border: '1px solid var(--ink-12)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={counterCell}>
            <StatBlock label={t('poolValue')} value="$4,862,014" decimals=".55" size="lg" />
          </div>
          <div style={counterCell}>
            <StatBlock label={t('projectsFunded')} value="14" size="lg" />
          </div>
          <div style={counterCell}>
            <StatBlock label={t('returnRate')} value="7.4" unit="%" size="lg" />
          </div>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--ink-40)',
            margin: '14px 0 0',
            textAlign: 'center',
          }}
        >
          {t('countersNote')}
        </p>
      </section>

      {/* How it works strip */}
      <section
        id="how"
        style={{
          background: 'var(--surface)',
          borderTop: '1px solid var(--ink-12)',
          borderBottom: '1px solid var(--ink-12)',
          scrollMarginTop: 68,
        }}
      >
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '64px 32px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem,3vw,2.6rem)',
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              color: 'var(--ink)',
            }}
          >
            {t('howTitle')}
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              color: 'var(--ink-60)',
              margin: '0 0 36px',
              maxWidth: 560,
            }}
          >
            {t('howSub')}
          </p>
          <div className="hb-how-grid">
            {steps.map((i) => (
              <div key={i}>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 13,
                    color: 'var(--solar)',
                    marginBottom: 10,
                  }}
                >
                  <span style={{ color: 'var(--ink)' }}>0{i}</span>
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 18,
                    margin: '0 0 6px',
                    color: 'var(--ink)',
                  }}
                >
                  {t(`step${i}Title`)}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: 'var(--ink-60)',
                    margin: 0,
                  }}
                >
                  {t(`step${i}Body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verify everything */}
      <section
        id="verify"
        className="hb-verify-grid"
        style={{ maxWidth: 1320, margin: '0 auto', padding: '64px 32px 80px', scrollMarginTop: 68 }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem,3vw,2.6rem)',
              letterSpacing: '-0.02em',
              margin: '0 0 14px',
              color: 'var(--ink)',
            }}
          >
            {t('verifyTitle')}
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              lineHeight: 1.6,
              color: 'var(--ink-60)',
              margin: '0 0 16px',
            }}
          >
            {t('verifyBody')}
          </p>
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 14,
              color: 'var(--ink)',
              background: 'var(--ink-06)',
              borderRadius: 'var(--radius-input)',
              padding: '14px 16px',
            }}
          >
            {t('formula')}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            background: 'var(--ink-12)',
            border: '1px solid var(--ink-12)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          {[
            [t('rowRegistry'), 'C…7K4Z'],
            [t('rowVault'), 'C…9QWJ'],
            [t('rowCadence'), t('rowCadenceValue')],
            [t('rowAudit'), t('rowAuditValue')],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--surface)',
                padding: '16px 18px',
              }}
            >
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--ink-60)' }}>
                {k}
              </span>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 13.5, color: 'var(--ink)' }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

const counterCell = { background: 'var(--surface)', padding: '28px 24px' } as const