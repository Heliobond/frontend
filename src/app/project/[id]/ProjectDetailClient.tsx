'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '../../../components'
import { ProjectDetail } from '../../../screens/ProjectDetail'
import { type ProjectWithDetail } from '../../../lib/api'
import { PriceHistoryChart } from '../../../components/PriceHistoryChart'

export interface ProjectDetailClientProps {
  id: number
  initialData: ProjectWithDetail | null
}

export function ProjectDetailClient({ id, initialData }: ProjectDetailClientProps) {
  const router = useRouter()
  const t = useTranslations('ProjectDetail')
  const [data] = useState<ProjectWithDetail | null>(initialData)

  if (!data) {
    return (
      <main
        id="main-content"
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
            fontSize: 'var(--type-h3)',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          {t('notFoundTitle')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-data)',
            color: 'var(--ink-60)',
            margin: 0,
          }}
        >
          {t('notFoundBody')}
        </p>
        <Button variant="primary" onClick={() => router.push('/explore')}>
          {t('notFoundCta')}
        </Button>
      </main>
    )
  }

  return (
    <>
      <ProjectDetail
        project={data.project}
        detail={data.detail}
        verifiedMetadata={data.verifiedMetadata}
        onInvest={() => {
          router.push('/connect')
          return Promise.resolve('/connect')
        }}
        onBack={() => router.push('/explore')}
      />
      <PriceHistoryChart projectId={id} />
    </>
  )
}
