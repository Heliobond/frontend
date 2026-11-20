import type { MetadataRoute } from 'next'
import { getProjectsPaginated } from '../lib/api'
import { CANONICAL_ORIGIN, PUBLIC_ROUTES } from '../lib/routeMetadata'

const BASE_URL = CANONICAL_ORIGIN

/** Regenerate at most hourly so crawlers see a stable document (#822). */
export const revalidate = 3600

const PAGE_SIZE = 100
/** Safety stop so a backend that never reports `hasMore: false` cannot loop forever. */
const MAX_PAGES = 100

/** Stable "last changed" stamp for static routes; bumped when route content is reworked. */
const STATIC_LAST_MODIFIED = new Date('2026-01-01T00:00:00.000Z')

async function getAllProjects() {
  const all: Awaited<ReturnType<typeof getProjectsPaginated>>['projects'] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const result = await getProjectsPaginated(page, PAGE_SIZE)
      all.push(...result.projects)
      if (!result.hasMore || result.projects.length === 0) break
    } catch (error) {
      console.error(`[sitemap] failed to load project page ${page}; keeping loaded routes`, error)
      break
    }
  }
  return all
}

type SitemapEntry = MetadataRoute.Sitemap[number]

/** Crawl weight and expected churn for each indexable static route (#657). */
const STATIC_ROUTE_PRIORITY: Record<
  string,
  { changeFrequency: NonNullable<SitemapEntry['changeFrequency']>; priority: number }
> = {
  '/': { changeFrequency: 'daily', priority: 1.0 },
  '/explore': { changeFrequency: 'daily', priority: 0.8 },
  '/creator': { changeFrequency: 'weekly', priority: 0.7 },
  '/learn': { changeFrequency: 'weekly', priority: 0.6 },
  '/verify': { changeFrequency: 'monthly', priority: 0.5 },
  '/risk': { changeFrequency: 'monthly', priority: 0.5 },
}

/**
 * Only indexable, public URLs. Wallet-private routes (portfolio, deposit,
 * withdraw, connect, watchlist, tax reports, admin) and dev-only routes are
 * excluded — they carry `robots: noindex` and are disallowed in robots.txt.
 *
 * Project URLs come from the same data layer `/project/[id]` uses, so a project
 * is either listed here and reachable, or neither.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route === '/' ? '' : route}`,
    lastModified: STATIC_LAST_MODIFIED,
    ...(STATIC_ROUTE_PRIORITY[route] ?? { changeFrequency: 'weekly', priority: 0.5 }),
  }))

  const projects = await getAllProjects()

  const projectRoutes: MetadataRoute.Sitemap = projects.map((project) => ({
    url: `${BASE_URL}/project/${project.id}`,
    // Projects carry no modification timestamp, so omit `lastModified` rather
    // than stamping every URL with the request time.
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...projectRoutes]
}
