import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getProject } from '../../../lib/api'
import { ogLocale } from '../../../i18n/config'
import { absoluteTitle } from '../../../lib/routeMetadata'
import { formatScore } from '../../../lib/score'
import { ProjectDetailClient } from './ProjectDetailClient'

type Props = {
  params: Promise<{ id: string }> | { id: string }
}

/**
 * Validates and parses the project ID route parameter.
 * Must be a string composed solely of decimal digits (/^\d+$/)
 * and evaluate to a JavaScript safe integer.
 */
export function parseProjectId(rawId: unknown): number | null {
  if (typeof rawId !== 'string' || !/^\d+$/.test(rawId)) {
    return null
  }
  const id = Number(rawId)
  if (!Number.isSafeInteger(id)) {
    return null
  }
  return id
}

/**
 * Per-project document metadata. The title is the project name only — the root
 * layout's `title.template` appends the brand, and `absolute` is used for the
 * error case so the "not found" title is not doubled up (#657).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations('Metadata')
  const locale = await getLocale()
  const resolvedParams = await params
  const id = parseProjectId(resolvedParams?.id)

  const notFoundMetadata = (): Metadata => ({
    title: { absolute: absoluteTitle(t('projectNotFound.title')) },
    description: t('projectNotFound.description'),
    robots: { index: false, follow: false },
  })

  if (id === null) return notFoundMetadata()

  // A confirmed miss resolves to `null`; a transient lookup failure rejects.
  // Let the rejection propagate so Next can show the error UI instead of
  // permanently noindexing a project that is merely unavailable right now.
  const data = await getProject(id)
  if (!data) return notFoundMetadata()

  const { project } = data
  const title = t('project.title', { name: project.name })
  const description = t('project.description', {
    name: project.name,
    type: project.type,
    location: project.location,
    credit: formatScore(project.credit),
    green: formatScore(project.green),
    funded: project.funded,
  })

  return {
    title,
    description,
    openGraph: {
      title: t('project.ogTitle', { name: project.name }),
      description,
      type: 'article',
      siteName: 'Heliobond',
      locale: ogLocale(locale),
      images: [
        {
          url: '/assets/og-image.png',
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
  const id = parseProjectId(resolvedParams?.id)
  if (id === null) {
    notFound()
  }

  // Only malformed IDs (`id === null`) and confirmed misses (`null` result)
  // are not-found. Let backend/registry failures reject into the error boundary
  // so the user gets the existing retry UI instead of a permanent 404.
  const data = await getProject(id)
  if (!data) {
    notFound()
  }

  return <ProjectDetailClient id={id} initialData={data} />
}
