'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '../../../components'
import { ProjectDetail } from '../../../screens/ProjectDetail'
import { getProject, type ProjectWithDetail } from '../../../lib/api'

export default function ProjectDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = Number(params?.id)

  const [data, setData] = useState<ProjectWithDetail | null | 'loading'>('loading')

  useEffect(() => {
    if (!Number.isFinite(id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null)
      return
    }
    getProject(id)
      .then((result) => setData(result))
      .catch(() => setData(null))
  }, [id])

  if (data === 'loading') {
    return <ProjectDetailSkeleton />
  }

  if (!data) {
    return (
      <main
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '96px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 24,
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          Project not found
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--ink-60)',
            margin: 0,
          }}
        >
          That project is not in the registry. It may have been moved.
        </p>
        <Button variant="primary" onClick={() => router.push('/explore')}>
          Back to projects
        </Button>
      </main>
    )
  }

  return (
    <ProjectDetail
      project={data.project}
      detail={data.detail}
      onInvest={() => router.push('/connect')}
      onBack={() => router.push('/explore')}
    />
  )
}

function ProjectDetailSkeleton() {
  return (
    <main
      style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 96px' }}
      aria-busy="true"
      aria-label="Loading project"
    >
      {/* Hero band placeholder */}
      <div
        aria-hidden="true"
        style={{
          height: 280,
          borderRadius: 'var(--radius-card)',
          background: 'var(--ink-06)',
          border: '1px solid var(--ink-12)',
          marginBottom: 28,
          animation: 'hb-pulse 1.4s ease-in-out infinite',
        }}
      />
      {/* Story placeholder */}
      <div
        aria-hidden="true"
        style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <div
          style={{
            height: 14,
            width: '30%',
            borderRadius: 6,
            background: 'var(--ink-06)',
            animation: 'hb-pulse 1.4s ease-in-out infinite',
          }}
        />
        <div
          style={{
            height: 17,
            width: '90%',
            borderRadius: 6,
            background: 'var(--ink-06)',
            animation: 'hb-pulse 1.4s ease-in-out 0.1s infinite',
          }}
        />
        <div
          style={{
            height: 17,
            width: '75%',
            borderRadius: 6,
            background: 'var(--ink-06)',
            animation: 'hb-pulse 1.4s ease-in-out 0.2s infinite',
          }}
        />
      </div>
      {/* Score cards placeholder */}
      <div
        aria-hidden="true"
        style={{ display: 'flex', gap: 32, marginBottom: 40, flexWrap: 'wrap' }}
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              flex: '1 1 240px',
              height: 220,
              borderRadius: 'var(--radius-card)',
              background: 'var(--ink-06)',
              border: '1px solid var(--ink-12)',
              animation: `hb-pulse 1.4s ease-in-out ${i * 0.1}s infinite`,
            }}
          />
        ))}
      </div>
    </main>
  )
}
