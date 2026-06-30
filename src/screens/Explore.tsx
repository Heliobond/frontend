'use client'

import { useEffect, useState, type CSSProperties } from 'react'
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

      {!loading && shown.length === 0 ? (
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
              fontSize: 20,
              color: 'var(--ink)',
              margin: '0 0 8px',
            }}
          >
            {t('emptyTitle')}
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14.5,
              color: 'var(--ink-60)',
              maxWidth: 400,
              margin: 0,
            }}
          >
            {t('emptySub', { filter: filter === 'All' ? t('filterAll') : filter })}
          </p>
        </div>
      ) : (
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
                  fundedLabel={t('cardFundedFromPool')}
                  verifiedLabel={t('cardVerifiedAgo', { ago: '2h' })}
                  onOpen={() => onOpen(p)}
                />
              ))}
        </div>
      )}
    </main>
  )
}

/**
 * ProjectCardSkeleton — pixel-for-pixel placeholder for ProjectCard.
 *
 * Mirrors the real card's DOM structure so the layout doesn't shift when
 * live data replaces the skeleton:
 *   • 168 px hero with a location-badge pill ghost in the bottom-left
 *   • 20 px display-weight title line (h3 equivalent)
 *   • Two 84 px circular score-gauge ghosts (matching ScoreGauge size)
 *   • Footer row: funded block on the left, verified chip on the right,
 *     separated by a 1 px top border — identical to the real card footer
 *
 * aria-hidden — all content is presentational; screen readers skip it.
 * Animation delays are staggered by 100 ms per row so the shimmer
 * cascades top-to-bottom rather than flashing all at once.
 */
function ProjectCardSkeleton() {
  const pulse = (delay = '0s'): CSSProperties => ({
    background: 'var(--ink-06)',
    animation: `hb-pulse 1.4s ease-in-out ${delay} infinite`,
    borderRadius: 6,
  })

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
      {/* ── Hero (168 px — matches ProjectCard image area) ─────────────── */}
      <div
        style={{
          height: 168,
          position: 'relative',
          ...pulse(),
          borderRadius: 0,
        }}
      >
        {/* Location badge ghost — bottom-left pill, same as real card */}
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            height: 26,
            width: 90,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface)',
            opacity: 0.6,
          }}
        />
      </div>

      <div style={{ padding: 20 }}>
        {/* ── Title (h3 — font-display 20 px, matches real card) ──────── */}
        <div
          style={{
            height: 22,
            width: '68%',
            marginBottom: 14,
            ...pulse('0.05s'),
          }}
        />

        {/* ── Score gauges (two 84 px circles — matches ScoreGauge size) ─ */}
        <div style={{ display: 'flex', gap: 18, marginBottom: 16 }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                ...pulse(`${0.1 + i * 0.1}s`),
              }}
            />
          ))}
        </div>

        {/* ── Footer row (funded + verified — matches real card footer) ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: 14,
            borderTop: '1px solid var(--ink-12)',
          }}
        >
          {/* Funded block: label line + value line */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 11, width: 80, ...pulse('0.2s') }} />
            <div style={{ height: 18, width: 64, ...pulse('0.25s') }} />
          </div>
          {/* Verified chip */}
          <div style={{ height: 11, width: 56, ...pulse('0.3s') }} />
        </div>
      </div>
    </div>
  )
}
