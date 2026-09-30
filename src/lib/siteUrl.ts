/**
 * Site URL configuration with environment variable fallbacks.
 *
 * Priority order:
 * 1. NEXT_PUBLIC_SITE_URL - Explicit override for all environments
 * 2. VERCEL_PROJECT_PRODUCTION_URL - Vercel production deployment
 * 3. VERCEL_URL - Vercel preview/branch deployment
 * 4. http://localhost:3000 - Local development fallback
 *
 * Used for:
 * - metadataBase in layout.tsx (resolves relative OG images)
 * - Canonical URLs in metadata
 * - Sitemap and robots.txt URLs
 * - Email templates with absolute links
 */

/**
 * Get the site URL from environment variables.
 * Returns an absolute URL with protocol and domain.
 */
export function getSiteUrl(): string {
  // 1. Explicit override (production, staging, development)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  // 2. Vercel production URL (automatic in production deployments)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  // 3. Vercel preview URL (automatic in preview deployments)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // 4. Local development fallback
  return 'http://localhost:3000'
}

/**
 * Export the site URL as a constant for use in metadata.
 * This is evaluated once at build time.
 */
export const siteUrl = getSiteUrl()
