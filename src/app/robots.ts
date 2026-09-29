import type { MetadataRoute } from 'next'
import { getSiteUrl } from '../lib/siteUrl'
import { DEV_ROUTES } from '../lib/devRoutes'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/explore', '/creator', '/project/'],
      disallow: ['/admin', '/portfolio', '/deposit', '/withdraw', ...DEV_ROUTES],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  }
}
