'use client'

import { useTranslations } from 'next-intl'
import { Landing } from '../../screens/Landing'

export default function VerifyPage() {
  const t = useTranslations('Footer')
  return (
    <main id="main-content">
      <Landing onConnect={() => {}} onExplore={() => {}} />
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '64px 32px', scrollMarginTop: 68 }}>
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
          {t('verify')}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-body)',
            lineHeight: 1.6,
            color: 'var(--ink-60)',
            margin: '0 0 16px',
          }}
        >
          Trust is shown, not claimed. The contracts are public, the oracle cadence is documented,
          and the return formula is written out in plain sight.
        </p>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 'var(--type-small)',
            color: 'var(--ink)',
            background: 'var(--ink-06)',
            borderRadius: 'var(--radius-input)',
            padding: '14px 16px',
          }}
        >
          expected return = investment × (credit + green) ÷ 200
        </div>
      </div>
    </main>
  )
}
