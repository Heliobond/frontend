import { getTranslations } from 'next-intl/server'

export default async function RiskPage() {
  const t = await getTranslations('Risk')
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
      <ul
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-body)',
          lineHeight: 1.7,
          color: 'var(--ink-60)',
          paddingInlineStart: 20,
          margin: 0,
        }}
      >
        <li>{t('li1')}</li>
        <li>{t('li2')}</li>
        <li>{t('li3')}</li>
        <li>{t('li4')}</li>
      </ul>
    </main>
  )
}
