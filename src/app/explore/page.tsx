import { Metadata } from 'next'
import { getProjectsPaginated } from '../../lib/api'
import { ExploreClient } from './ExploreClient'

export const metadata: Metadata = {
  title: 'Explore Green Energy Bonds | Heliobond',
  description:
    'Browse verified solar, wind, and hydro green energy projects on Stellar. Filter by asset type and evaluate credit & environmental impact scores.',
  openGraph: {
    title: 'Explore Green Energy Bonds | Heliobond',
    description:
      'Browse verified solar, wind, and hydro green energy projects on Stellar. Filter by asset type and evaluate credit & environmental impact scores.',
    type: 'website',
  },
}

export default async function ExplorePage() {
  const data = await getProjectsPaginated(1, 50).catch(() => ({ projects: [], total: 0 }))
  return <ExploreClient initialProjects={data.projects} initialTotal={data.total} />
}
