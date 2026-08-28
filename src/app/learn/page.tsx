'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function LearnPage() {
  const t = useTranslations('Learn')
  return (
    <main id="main-content" style={{ maxWidth: 760, margin: '0 auto', padding: '64px 32px' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 'clamp(2rem,3.6vw,3rem)',
          letterSpacing: '-0.02em',
          margin: '0 0 16px',
          color: 'var(--ink)',
        }}
      >
        {t('title')}
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-body)',
          lineHeight: 1.6,
          color: 'var(--ink-60)',
          margin: '0 0 24px',
        }}
      >
        {t('body')}
      </p>
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--ink-12)',
          borderRadius: 'var(--radius-card)',
          padding: 24,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--type-h5)',
            margin: '0 0 10px',
            color: 'var(--ink)',
          }}
        >
          {t('howTitle')}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-small)',
            lineHeight: 1.6,
            color: 'var(--ink-60)',
            margin: 0,
          }}
        >
          {t('howBody')}
        </p>
        <Link
          href="/learn/password-reset-email"
          style={{
            display: 'inline-flex',
            marginTop: 16,
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Preview the password reset email
        </Link>
      </div>
    </main>
  )
}
