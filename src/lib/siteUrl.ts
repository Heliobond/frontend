/**
 * Centralized site URL helper.
 *
 * Resolution order:
 * 1. `NEXT_PUBLIC_SITE_URL` — explicit, production-grade.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — set automatically by Vercel for prod.
 * 3. `VERCEL_URL` — set automatically by Vercel for preview deployments.
 * 4. `http://localhost:3000` — local dev fallback.
 *
 * Used by:
 * - `src/app/layout.tsx` → `metadataBase` for Next.js metadata
 * - `src/app/sitemap.ts` → sitemap URLs
 * - `src/app/robots.ts` → sitemap reference
 * - `src/lib/email/passwordResetTemplate.ts` → support link
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelProd) return `https://${vercelProd}`

  const vercelPreview = process.env.VERCEL_URL?.trim()
  if (vercelPreview) return `https://${vercelPreview}`

  return 'http://localhost:3000'
}
