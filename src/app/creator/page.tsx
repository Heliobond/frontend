'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Tag } from '@/components'
import { CreatorApplication } from '@/screens/creator/CreatorApplication'
import { ProjectBuilder } from '@/screens/creator/ProjectBuilder'
import { CreatorDashboard } from '@/screens/creator/CreatorDashboard'

type CreatorTab = 'apply' | 'build' | 'dashboard'

export default function CreatorPage() {
  const t = useTranslations('Creator')
  const [tab, setTab] = useState<CreatorTab>('apply')

  const TABS: { id: CreatorTab; label: string }[] = [
    { id: 'apply', label: t('tabApply') },
    { id: 'build', label: t('tabBuild') },
    { id: 'dashboard', label: t('tabDashboard') },
  ]

  return (
    <main id="main-content" style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px 80px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 'clamp(2rem,3.4vw,2.6rem)',
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
            lineHeight: 1.5,
            color: 'var(--ink-60)',
            margin: 0,
            maxWidth: 640,
          }}
        >
          {t('description')}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Creator space sections"
        style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}
      >
        {TABS.map((t) => (
          <Tag
            key={t.id}
            selected={tab === t.id}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label}
          </Tag>
        ))}
      </div>

      {tab === 'apply' && (
        <CreatorApplication
          stage="submitted"
          onSubmit={() => {
            // Self-contained demo handler — a real build would POST to the registry API.
          }}
        />
      )}
      {tab === 'build' && <ProjectBuilder />}
      {tab === 'dashboard' && <CreatorDashboard />}
    </main>
  )
}
