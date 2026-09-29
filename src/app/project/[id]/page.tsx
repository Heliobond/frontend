import { Metadata } from 'next'
import { getProject } from '../../../lib/api'
import { ProjectDetailClient } from './ProjectDetailClient'

type Props = {
  params: Promise<{ id: string }> | { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params
  const id = Number(resolvedParams?.id)
  if (!Number.isFinite(id)) {
    return {
      title: 'Project Not Found | Heliobond',
      description: 'The requested green energy project could not be found.',
    }
  }

  const data = await getProject(id).catch(() => null)
  if (!data) {
    return {
      title: 'Project Not Found | Heliobond',
      description: 'The requested green energy project could not be found.',
    }
  }

  const { project } = data
  const title = `${project.name} — Green Bond Details | Heliobond`
  const description = `${project.name} (${project.type}) in ${project.location}. Verified Credit Quality: ${project.credit}/100, Green Impact: ${project.green}/100. Stated Funding Goal: ${project.funded}.`

  return {
    title,
    description,
    openGraph: {
      title: `${project.name} | Heliobond Green Bond Pool`,
      description,
      type: 'article',
      siteName: 'Heliobond',
      images: [
        {
          url: '/screenshots/deposit-dark.svg',
          width: 1200,
          height: 630,
          alt: project.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function ProjectDetailPage({ params }: Props) {
  const resolvedParams = await params
  const id = Number(resolvedParams?.id)
  const data = Number.isFinite(id) ? await getProject(id).catch(() => null) : null

  return <ProjectDetailClient id={id} initialData={data} />
}
