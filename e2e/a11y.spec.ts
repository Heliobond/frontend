import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { ROUTES, AUTH_ROUTES } from '../src/lib/routeMetadata'
import { DEV_ROUTES } from '../src/lib/devRoutes'

const DEMO_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

/**
 * Known violations allowlist.
 * Each entry must link to an open issue tracking remediation.
 */
const KNOWN_VIOLATIONS: Record<string, string> = {
  // Color contrast refinement on historical sparklines and badges: tracked in issue #467
  'color-contrast': 'https://github.com/Heliobond/frontend/issues/467',
}

async function seedSession(
  page: import('@playwright/test').Page,
  theme: 'light' | 'dark',
  seedWallet: boolean,
) {
  await page.addInitScript(
    ({ address, shouldSeedWallet, selectedTheme }) => {
      localStorage.setItem('hb-theme', selectedTheme)
      document.documentElement.dataset.theme = selectedTheme
      if (shouldSeedWallet) {
        localStorage.setItem('hb-address', address)
        localStorage.setItem('hb-wallet', 'demo')
      }
    },
    { address: DEMO_ADDRESS, shouldSeedWallet: seedWallet, selectedTheme: theme },
  )
}

const publicRoutes = ROUTES.map((r) => r.path).filter(
  (p) => !(DEV_ROUTES as readonly string[]).includes(p),
)
const allTargetRoutes: { path: string; needsAuth: boolean }[] = [
  ...publicRoutes.map((path) => ({ path, needsAuth: false })),
  ...AUTH_ROUTES.map((path) => ({ path, needsAuth: true })),
]

const themes: ('light' | 'dark')[] = ['light', 'dark']

test.describe('Automated Axe Accessibility Audit', () => {
  for (const theme of themes) {
    test.describe(`Theme: ${theme}`, () => {
      for (const route of allTargetRoutes) {
        test(`route ${route.path} meets WCAG standards in ${theme} mode`, async ({
          page,
        }, testInfo) => {
          await seedSession(page, theme, route.needsAuth)
          await page.goto(route.path)
          await page.waitForLoadState('networkidle')

          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .exclude('canvas')
            .analyze()

          await testInfo.attach(
            `axe-results-${route.path.replace(/\//g, '_') || 'root'}-${theme}`,
            {
              body: JSON.stringify(results, null, 2),
              contentType: 'application/json',
            },
          )

          const criticalAndSeriousViolations = results.violations.filter(
            (v) => (v.impact === 'serious' || v.impact === 'critical') && !KNOWN_VIOLATIONS[v.id],
          )

          expect(
            criticalAndSeriousViolations,
            `Unallowlisted accessibility violations detected on ${route.path} (${theme} mode): ` +
              JSON.stringify(
                criticalAndSeriousViolations.map((v) => ({
                  id: v.id,
                  impact: v.impact,
                  help: v.help,
                })),
                null,
                2,
              ),
          ).toEqual([])
        })
      }
    })
  }
})
