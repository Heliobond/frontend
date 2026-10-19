/**
 * Dev-only routes (#606) - internal tooling pages such as the contrast-audit
 * harness and the email template preview live under `src/app/(dev)`. They are
 * reachable in `next dev`, and return 404 in production builds unless
 * NEXT_PUBLIC_ENABLE_DEV_ROUTES=true (e.g. for a preview deployment).
 */

/** Paths served from the `(dev)` route group. Kept out of the sitemap and robots allow-list. */
export const DEV_ROUTES = ['/contrast-test', '/learn/password-reset-email'] as const

export function devRoutesEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES,
): boolean {
  if (flag === 'true') return true
  if (flag === 'false') return false
  return nodeEnv !== 'production'
}
