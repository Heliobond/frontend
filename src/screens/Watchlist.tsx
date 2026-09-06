'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Badge, ProjectCard, WatchlistButton } from '../components'
import { type Project } from '../data'
import { selectProjects } from '../state/selectors'
import { getProjects } from '../lib/api'
import { getBondStatus, isBondAvailable } from '../lib/watchlist'
import { useWatchlist } from '../watchlist/WatchlistProvider'

/**
 * Watchlist -- bonds a person is tracking without investing (issue #407). Same
 * card grid as Explore, ordered by when each was saved, with a per-card
 * availability marker and an in-app note when saved bonds are open for funding.
 */
export interface WatchlistProps {
  onOpen: (project: Project) => void
}

export function Watchlist({ onOpen }: WatchlistProps) {
  const t = useTranslations('Watchlist')
  const { ids } = useWatchlist()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => setProjects(selectProjects()))
      .finally(() => setLoading(false))
  }, [])

  const saved = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]))
    return ids.map((id) => byId.get(id)).filter((p): p is Project => p !== undefined)
  }, [projects, ids])

  const availableCount = saved.filter(isBondAvailable).length

  return (
    <main
      id="main-content"
      style={{ maxWidth: 1320, margin: '0 auto', padding: '48px 32px 80px' }}
    >
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 'clamp(2rem,3.6vw,3rem)',
            letterSpacing: '-0.02em',
            margin: '0 0 8px',
            color: 'var(--ink)',
          }}
        >
          {t('title')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-body)',
            color: 'var(--ink-60)',
            margin: 0,
            maxWidth: 560,
          }}
        >
          {t('sub')}
        </p>
      </div>

      {!loading && availableCount > 0 && (
        <div
          role="status"
          style={{
            marginBottom: 20,
            padding: '10px 14px',
            borderRadius: 'var(--radius-input)',
            background: 'var(--ink-06)',
            border: '1px solid var(--ink-12)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            color: 'var(--ink-60)',
          }}
        >
           {t('availableBanner', { count: availableCount })}
        </div>
      )}

      {!loading && saved.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '80px 24px',
            background: 'var(--surface)',
            border: '1px solid var(--ink-12)',
            borderRadius: 'var(--radius-modal)',
            boxShadow: 'var(--shadow-sm)',
            margin: '20px 0',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--type-h4)',
              color: 'var(--ink)',
              margin: '0 0 8px',
            }}
          >
            {t('emptyTitle')}
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-data)',
              color: 'var(--ink-60)',
              maxWidth: 400,
              margin: 0,
            }}
          >
            {t('emptySub')}
          </p>
        </div>
      ) : (
        !loading && (
          <div className="hb-projects-grid">
            {saved.map((p) => {
              const open = getBondStatus(p) === 'open'
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minWidth: 0,
                    overflowWrap: 'break-word',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--type-small)',
                      color: 'var(--ink-60)',
                    }}
                  >
                    <Badge tone={open ? 'growth' : 'neutral'}>
                      {open ? t('statusOpen') : t('statusUpcoming')}
                    </Badge>
                    {!open && <span>{t('notYetAvailable')}</span>}
                  </div>
                  <div style={{ minWidth: 0, width: '100%' }}>
                    <ProjectCard
                      name={p.name}
                      location={p.location}
                      credit={p.credit}
                      green={p.green}
                      funded={p.funded}
                      fundedLabel={t('cardFundedFromPool')}
                      onOpen={() => onOpen(p)}
                      fundingGoal={p.fundingGoal}
                      fundedAmount={p.fundedAmount}
                      action={<WatchlistButton bondId={p.id} bondName={p.name} />}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </main>
  )
}