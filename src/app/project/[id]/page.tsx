'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '../../../components'
import { ProjectDetail } from '../../../screens/ProjectDetail'
import { getProject, type ProjectWithDetail } from '../../../lib/api'

export default function ProjectDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const t = useTranslations('ProjectDetail')
  const id = Number(params?.id)

  const [data, setData] = useState<ProjectWithDetail | null | 'loading'>('loading')

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setData(null)
      return
    }
    getProject(id)
      .then((result) => setData(result))
     .catch(() => setData(null))
  }, [id])

  if (data === 'loading') {
    return <div id="main-content" aria-label="Loading project" style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 96px' }}>Loading...</div>
  }

  if (!data) {
    return (
      <main id="main-content" style={{ maxWidth: 480, margin: '0 auto', padding: '96px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--type-h3)', color: 'var(--ink)', margin: 0 }}>{t('notFoundTitle')}</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--type-data)', color: 'var(--ink-60)', margin: 0 }}>{t('notFoundBody')}</p>
        <Button variant="primary" onClick={() => router.push('/explore')}>{t('notFoundCta')}</Button>
      </main>
    )
  }

  return (
    <ProjectDetail
      project={data.project}
      detail={data.detail}
      onInvest={async () => {
        router.push('/connect')
        return ''
      }}
      onBack={() => router.push('/explore')}
    />
  )
}
