'use client'

import { useState } from 'react'
import { Tag } from '@/components'
import { CreatorApplication } from '@/screens/creator/CreatorApplication'
import { ProjectBuilder } from '@/screens/creator/ProjectBuilder'
import { CreatorDashboard } from '@/screens/creator/CreatorDashboard'

type CreatorTab = 'apply' | 'build' | 'dashboard'

const TABS: { id: CreatorTab; label: string }[] = [
  { id: 'apply', label: 'Apply' },
  { id: 'build', label: 'Build project' },
  { id: 'dashboard', label: 'Dashboard' },
]

export default function CreatorPage() {
  const [tab, setTab] = useState<CreatorTab>('apply')

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px 80px' }}>
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
          Creator space
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
          Apply for the whitelist, build your project page, and watch the pool fund it. The oracle
          scores your credit quality and green impact, and we show you exactly what moves them.
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
