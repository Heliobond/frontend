'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Tag } from '@/components'
import { CreatorApplication } from '@/screens/creator/CreatorApplication'
import { ProjectBuilder } from '@/screens/creator/ProjectBuilder'
import { CreatorDashboard } from '@/screens/creator/CreatorDashboard'

type CreatorTab = 'apply' | 'build' | 'dashboard'

const VALID_TABS = new Set<CreatorTab>(['apply', 'build', 'dashboard'])

function toTab(value: string | null): CreatorTab {
  if (value && VALID_TABS.has(value as CreatorTab)) return value as CreatorTab
  return 'apply'
}

/**
 * Inner component — holds useSearchParams so the Suspense boundary in the
 * default export can provide a fallback during static prerendering, satisfying
 * Next.js's requirement without deopting the whole route.
 */
function CreatorPageInner() {
  const t = useTranslations('Creator')
  const router = useRouter()
  const searchParams = useSearchParams()

  const tab = toTab(searchParams.get('tab'))

  /**
   * Write the new tab into ?tab= using replace so tab switches don't push
   * entries onto the history stack — back/forward navigates between pages,
   * not between tabs on the same page.
   */
  const setTab = useCallback(
    (next: CreatorTab) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', next)
      router.replace(`/creator?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

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
        aria-label={t('tabsLabel')}
        style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}
      >
        {TABS.map((tb) => (
          <Tag
            key={tb.id}
            selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            role="tab"
            aria-selected={tab === tb.id}
          >
            {tb.label}
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

/**
 * Creator page — wraps the inner component in Suspense so Next.js can
 * statically prerender the shell while useSearchParams resolves on the client.
 * The fallback is a minimal height reservation to avoid layout shift.
 */
export default function CreatorPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: 'calc(100dvh - 140px)' }} />}>
      <CreatorPageInner />
    </Suspense>
  )
}
