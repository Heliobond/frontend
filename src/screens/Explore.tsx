'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ProjectCard, Tag } from '../components'
import { HB_DATA, type Project, type ProjectType } from '../data'
import { getProjects } from '../lib/api'

/**
 * Explore — a living atlas, not a shop. Grid of all registered projects with
 * filters by type; sort defaults to recency, never "hottest" (no FOMO).
 */
export interface ExploreProps {
  onOpen: (project: Project) => void
}

const TYPES: (ProjectType | 'All')[] = ['All', 'Solar', 'Wind', 'Hydro']

export function Explore({ onOpen }: ExploreProps) {
  const t = useTranslations('Explore')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)
  const [filter, setFilter] = useState<ProjectType | 'All'>('All')

  useEffect(() => {
    getProjects()
      .then((data) => {
        setProjects(data)
      })
      .catch(() => {
        setProjects(HB_DATA.projects)
        setApiError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const shown = filter === 'All' ? projects : projects.filter((p) => p.type === filter)

  return (
    <main id="main-content" style={{ maxWidth: 1320, margin: '0 auto', padding: '48px 32px 80px' }}>
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
            fontSize: 16,
            color: 'var(--ink-60)',
            margin: 0,
            maxWidth: 560,
          }}
        >
          {t('sub')}
        </p>
      </div>

      {apiError && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: '9px 14px',
            borderRadius: 'var(--radius-input)',
            background: 'var(--ink-06)',
            border: '1px solid var(--ink-12)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--ink-60)',
          }}
        >
          Showing cached data — live API unavailable.
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TYPES.map((ty) => (
            <Tag key={ty} selected={filter === ty} onClick={() => setFilter(ty)}>
              {ty === 'All' ? t('filterAll') : ty}
            </Tag>
          ))}
        </div>
        {!loading && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--ink-60)' }}>
            {t('countSorted', { count: shown.length })}
          </span>
        )}
      </div>

      <div className="hb-projects-grid">
        {loading
          ? Array.from({ length: 6 }, (_, i) => <ProjectCardSkeleton key={i} />)
          : shown.map((p) => (
              <ProjectCard
                key={p.id}
                name={p.name}
                location={p.location}
                credit={p.credit}
                green={p.green}
                funded={p.funded}
                verifiedAgo="2h ago"
                onOpen={() => onOpen(p)}
              />
            ))}
      </div>
    </main>
  )
}

function ProjectCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Hero image placeholder */}
      <div
        style={{
          height: 160,
          background: 'var(--ink-06)',
          animation: 'hb-pulse 1.4s ease-in-out infinite',
        }}
      />
      <div style={{ padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Title line */}
        <div
          style={{
            height: 18,
            width: '70%',
            borderRadius: 6,
            background: 'var(--ink-06)',
            animation: 'hb-pulse 1.4s ease-in-out infinite',
          }}
        />
        {/* Location line */}
        <div
          style={{
            height: 13,
            width: '45%',
            borderRadius: 6,
            background: 'var(--ink-06)',
            animation: 'hb-pulse 1.4s ease-in-out 0.1s infinite',
          }}
        />
        {/* Score bars */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <div
            style={{
              height: 13,
              width: 60,
              borderRadius: 6,
              background: 'var(--ink-06)',
              animation: 'hb-pulse 1.4s ease-in-out 0.2s infinite',
            }}
          />
          <div
            style={{
              height: 13,
              width: 60,
              borderRadius: 6,
              background: 'var(--ink-06)',
              animation: 'hb-pulse 1.4s ease-in-out 0.3s infinite',
            }}
          />
        </div>
      </div>
    </div>
  )
}
