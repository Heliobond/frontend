'use client'

import { useParams, useRouter } from 'next/navigation'
import { Button } from '../../../components'
import { ProjectDetail } from '../../../screens/ProjectDetail'
import { HB_DATA } from '../../../data'
import { PROJECT_DETAILS } from '../../../data/projectDetails'

export default function ProjectDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()

  const id = Number(params?.id)
  const project = Number.isFinite(id) ? HB_DATA.projects.find((p) => p.id === id) : undefined
  const detail = Number.isFinite(id) ? PROJECT_DETAILS[id] : undefined

  if (!project || !detail) {
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
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink)', margin: 0 }}>
          Project not found
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--ink-60)', margin: 0 }}>
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
      project={project}
      detail={detail}
      onInvest={() => router.push('/connect')}
      onBack={() => router.push('/explore')}
    />
  )
}
