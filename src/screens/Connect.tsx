'use client'

import { useTranslations } from 'next-intl'
import { Button, type ButtonVariant } from '../components'

/**
 * Connect — the acceptance moment. Two equal doors, zero hierarchy shaming.
 * "Connect wallet" opens the real Stellar Wallets Kit; "start with email" uses
 * the demo path so the click-through always works. Education cards disclose the
 * liquidity rule here, before any money moves.
 */
export interface ConnectProps {
  onWallet: () => void
  onNew: () => void
  onCancel: () => void
}

export function Connect({ onWallet, onNew, onCancel }: ConnectProps) {
  const t = useTranslations('Connect')
  const edu = [1, 2, 3] as const

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '56px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 'clamp(2rem,3.6vw,2.8rem)',
            letterSpacing: '-0.02em',
            margin: '0 0 10px',
            color: 'var(--ink)',
          }}
        >
          {t('title')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 16.5,
            color: 'var(--ink-60)',
            margin: 0,
          }}
        >
          {t('sub')}
        </p>
      </div>

      <div className="hb-doors-grid" style={{ marginBottom: 28 }}>
        <Door
          title={t('walletTitle')}
          body={t('walletBody')}
          cta={t('walletCta')}
          variant="secondary"
          onClick={onWallet}
          chips={['Freighter', 'xBull', 'Albedo', 'Lobstr']}
        />
        <Door
          title={t('newTitle')}
          body={t('newBody')}
          cta={t('newCta')}
          variant="primary"
          onClick={onNew}
          chips={['Email', 'Passkey', t('addFunds')]}
        />
      </div>

      <div className="hb-edu-grid">
        {edu.map((i) => (
          <div
            key={i}
            style={{ background: 'var(--ink-06)', borderRadius: 'var(--radius-card)', padding: 18 }}
          >
            <div
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 12,
                color: 'var(--ink-40)',
                marginBottom: 8,
              }}
            >
              {t('read20')}
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 16,
                margin: '0 0 6px',
                color: 'var(--ink)',
              }}
            >
              {t(`edu${i}Title`)}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13.5,
                lineHeight: 1.5,
                color: 'var(--ink-60)',
                margin: 0,
              }}
            >
              {t(`edu${i}Body`)}
            </p>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <button
          onClick={onCancel}
          className="hb-textlink"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--ink-60)',
          }}
        >
          {t('keepExploring')}
        </button>
      </div>
    </main>
  )
}

interface DoorProps {
  title: string
  body: string
  cta: string
  variant: ButtonVariant
  onClick: () => void
  chips: string[]
}

function Door({ title, body, cta, variant, onClick, chips }: DoorProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-modal)',
        padding: 26,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 21,
          letterSpacing: '-0.01em',
          margin: '0 0 8px',
          color: 'var(--ink)',
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14.5,
          lineHeight: 1.5,
          color: 'var(--ink-60)',
          margin: '0 0 16px',
        }}
      >
        {body}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {chips.map((c) => (
          <span
            key={c}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12.5,
              color: 'var(--ink-60)',
              background: 'var(--ink-06)',
              borderRadius: 'var(--radius-pill)',
              padding: '5px 11px',
            }}
          >
            {c}
          </span>
        ))}
      </div>
      <Button
        variant={variant}
        size="lg"
        style={{ width: '100%', marginTop: 'auto' }}
        onClick={onClick}
      >
        {cta}
      </Button>
    </div>
  )
}
