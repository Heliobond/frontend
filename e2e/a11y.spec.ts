import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { ROUTES } from '../src/lib/routeMetadata'
import { DEV_ROUTES } from '../src/lib/devRoutes'

const DEMO_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

/**
 * Seed a demo wallet session via localStorage so authenticated pages can render
 * without redirecting or showing disconnect banners (#722).
 */
async function seedDemoWallet(page: import('@playwright/test').Page) {
  await page.addInitScript(
    ({ address }) => {
      localStorage.setItem('hb-address', address)
      localStorage.setItem('hb-wallet', 'demo')
    },
    { address: DEMO_ADDRESS },
  )
}

/**
 * Pre-set theme in localStorage and on root document before page load (#722).
 */
async function setTheme(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    ({ t }) => {
      localStorage.setItem('hb-theme', t)
      document.documentElement.dataset.theme = t
    },
    { t: theme },
  )
}

/**
 * Allowlist for pre-existing accessibility issues with linked GitHub issues (#722).
 * Prevents existing bugs from blocking CI while enforcing zero regressions on all other checks.
 */
const KNOWN_VIOLATIONS: Record<string, string> = {
  // #709: primary Button is off-brand #007FFF with white text (3.83:1 contrast)
  'color-contrast': 'https://github.com/Heliobond/frontend/issues/709',
}

// Dev-only routes to skip
const devRouteSet = new Set<string>(DEV_ROUTES)

// Non-dev routes from routeMetadata
const publicRoutes = ROUTES.filter((r) => !r.private).map((r) => r.path)
const authenticatedRoutes = ['/deposit', '/withdraw', '/portfolio']

const allAuditRoutes = Array.from(new Set([...publicRoutes, ...authenticatedRoutes])).filter(
  (p) => !devRouteSet.has(p),
)

const THEMES: readonly ('light' | 'dark')[] = ['light', 'dark']

test.describe('Automated accessibility audits (WCAG 2.1 AA)', () => {
  for (const route of allAuditRoutes) {
    for (const theme of THEMES) {
      test(`audits ${route} [theme=${theme}]`, async ({ page }, testInfo) => {
        await setTheme(page, theme)

        if (authenticatedRoutes.includes(route)) {
          await seedDemoWallet(page)
        }

        await page.goto(route, { waitUntil: 'domcontentloaded' })

        // Allow hydration and transitions to settle
        await page.waitForLoadState('networkidle').catch(() => {})

        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .exclude('canvas')
          .analyze()

        // Filter violations: fail on serious and critical violations not in allowlist
        const seriousViolations = axeResults.violations.filter((v) => {
          if (v.impact !== 'serious' && v.impact !== 'critical') {
            return false
          }
          if (v.id in KNOWN_VIOLATIONS) {
            return false
          }
          return true
        })

        // Attach full results JSON to Playwright report
        await testInfo.attach(`axe-results-${route.replace(/\//g, '_') || 'root'}-${theme}`, {
          body: JSON.stringify(axeResults, null, 2),
          contentType: 'application/json',
        })

        expect(
          seriousViolations,
          `Unexpected serious/critical a11y violations found on ${route} (${theme}): ${JSON.stringify(
            seriousViolations.map((v) => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
            })),
            null,
            2,
          )}`,
        ).toHaveLength(0)
      })
    }
  }
})
