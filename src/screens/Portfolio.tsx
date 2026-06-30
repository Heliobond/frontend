'use client'

import { type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button, StatBlock, LiquidityMeter, Card } from '../components'
import { Helio } from '../brand/Helio'
import { HB_DATA } from '../data'

/**
 * Portfolio — calm dashboard. Headline value with delta since deposit, the
 * personal mini-Helio, and three always-visible figures including the permanent
 * "Available to withdraw now" liquidity truth.
 */
export interface PortfolioProps {
  onWithdraw: () => void
  onDeposit: () => void
}

export function Portfolio({ onWithdraw, onDeposit }: PortfolioProps) {
  const t = useTranslations('Portfolio')
  const d = HB_DATA

  return (
    <main id="main-content" style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px 80px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 24,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <div>
          <div className="hb-eyebrow" style={{ marginBottom: 14 }}>
            {t('eyebrow')}
          </div>
          <StatBlock
            label={t('currentValue')}
            value="$24,180"
            decimals=".45"
            delta={`+$612.18 (2.6%) ${t('sinceDeposit')}`}
            size="lg"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Helio size={108} motes={d.you.backed} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={onWithdraw}>
              {t('withdraw')}
            </Button>
            <Button variant="primary" onClick={onDeposit}>
              {t('investMore')}
            </Button>
          </div>
        </div>
      </div>

      {/* three always-visible figures */}
      <div className="hb-figures-grid" style={{ margin: '28px 0' }}>
        <Card style={{ padding: 22 }}>
          <StatBlock label={t('hbsHeld')} value="24,041" decimals=".2310" size="md" />
        </Card>
        <Card style={{ padding: 22 }}>
          <StatBlock label={t('poolShare')} value="0.49" unit="%" size="md" />
        </Card>
        <Card style={{ padding: 22 }}>
          <LiquidityMeter liquid={236} total={482} currency="$" showExplanation={false} />
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-eyebrow)',
              color: 'var(--ink-60)',
              margin: '8px 0 0',
            }}
          >
            {t('liquidCaption')}
          </p>
        </Card>
      </div>

      <div className="hb-portfolio-grid">
        {/* Impact */}
        <Card style={{ padding: 22 }}>
          <h3 style={cardTitle}>{t('impactTitle')}</h3>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              lineHeight: 1.55,
              color: 'var(--ink-60)',
              margin: '0 0 16px',
            }}
          >
            {t.rich('impactBody', {
              b: (c: ReactNode) => <b style={{ color: 'var(--ink)' }}>{c}</b>,
            })}
          </p>
          <div style={{ display: 'flex', gap: 24 }}>
            <StatBlock label={t('projectsBacked')} value="14" size="sm" />
            <StatBlock label={t('weightedGreen')} value="88" size="sm" />
          </div>
        </Card>

        {/* Activity */}
        <Card style={{ padding: 22 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h3 style={cardTitle}>{t('activityTitle')}</h3>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-caption)',
                color: 'var(--ink-40)',
              }}
            >
              {t('activityNote')}
            </span>
          </div>
          {d.activity.map((a, i) => (
            <div
              key={a.hash}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderTop: i ? '1px solid var(--ink-12)' : 'none',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-small)',
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  {a.kind}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-caption)',
                    color: 'var(--ink-60)',
                  }}
                >
                  {a.amount}
                  {a.shares ? ` · ${a.shares}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-caption)',
                    color: 'var(--ink-60)',
                  }}
                >
                  {a.when}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 'var(--type-eyebrow)',
                    color: 'var(--ink-40)',
                  }}
                >
                  {a.hash} ↗
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </main>
  )
}

const cardTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'var(--type-body-lg)',
  margin: '0 0 10px',
  color: 'var(--ink)',
}
