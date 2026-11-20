import type { Metadata } from 'next'
import { getProjectsPaginated } from '../../lib/api'
import { routeMetadata } from '../../lib/routeMetadata.server'
import { ExploreClient } from './ExploreClient'

/** Indexable public content route (#657). */
export async function generateMetadata(): Promise<Metadata> {
  return routeMetadata('/explore')
}

export default async function ExplorePage() {
  const data = await getProjectsPaginated(1, 50).catch(() => undefined)
  return <ExploreClient initialProjects={data?.projects} initialTotal={data?.total} />
}
