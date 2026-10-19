import { test, expect } from '@playwright/test'

/** A single `securitypolicyviolation` entry captured inside the page. */
interface CapturedViolation {
  directive: string
  blockedURI: string
  originalPolicy: string
}

/**
 * The page-side collector is installed via `addInitScript`, which runs in the
 * browser before any app code, so the violations have to travel on `window`.
 */
declare global {
  interface Window {
    __cspViolations?: CapturedViolation[]
  }
}

const ROUTES = ['/', '/explore', '/connect', '/deposit', '/withdraw']
const SMOKE_ROUTES = ['/', '/explore']
const isProductionCSP = process.env.E2E_PRODUCTION === 'true'

test.describe('Security headers (#601)', () => {
  for (const route of ROUTES) {
    test(`${route} sends the security headers`, async ({ request }) => {
      const res = await request.get(route)
      const h = res.headers()

      expect(h['x-content-type-options']).toBe('nosniff')
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(h['strict-transport-security']).toContain('max-age=')
      expect(h['permissions-policy']).toContain('camera=()')

      // Report-only until CSP_MODE=enforce.
      const csp = h['content-security-policy'] ?? h['content-security-policy-report-only']
      expect(csp).toBeTruthy()
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/)
    })
  }

  test('inline theme script carries the request nonce and nothing is blocked', async ({
    page,
    request,
  }) => {
    // Browsers hide nonce attributes from the DOM, so read them from the raw HTML.
    const res = await request.get('/')
    const csp =
      res.headers()['content-security-policy'] ??
      res.headers()['content-security-policy-report-only']
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]
    expect(await res.text()).toContain(`nonce="${nonce}"`)

    const violations: string[] = []
    page.on('console', (m) => {
      if (/content security policy/i.test(m.text())) violations.push(m.text())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(violations).toEqual([])
  })
})

test.describe('Production CSP enforcement (#663)', () => {
  test.skip(!isProductionCSP, 'Run with E2E_PRODUCTION=true to test production CSP')

  test('production CSP header is enforced, not report-only', async ({ request }) => {
    const res = await request.get('/')
    const h = res.headers()

    // In production with CSP_MODE=enforce, the header must be the enforcing variant
    expect(h['content-security-policy']).toBeTruthy()
    expect(h['content-security-policy-report-only']).toBeUndefined()

    const csp = h['content-security-policy']!
    // Production policy must NOT contain dev-only directives
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).not.toContain('ws:')
    expect(csp).not.toContain('http://localhost')
    // Production policy must contain upgrade-insecure-requests
    expect(csp).toContain('upgrade-insecure-requests')
  })

  for (const route of SMOKE_ROUTES) {
    test(`${route} loads with no CSP violations in production`, async ({ page }) => {
      const violations: Array<{ directive: string; blockedURI: string }> = []

      // Listen for securitypolicyviolation events
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__cspViolations = window.__cspViolations || []
          window.__cspViolations.push({
            directive: e.violatedDirective,
            blockedURI: e.blockedURI,
            originalPolicy: e.originalPolicy,
          })
        })
      })

      await page.goto(route)
      await page.waitForLoadState('networkidle')

      // Check for violations
      const capturedViolations = await page.evaluate<CapturedViolation[]>(
        () => window.__cspViolations || [],
      )
      violations.push(...capturedViolations)

      if (violations.length > 0) {
        console.error('CSP violations detected:', violations)
      }
      expect(violations).toEqual([])
    })
  }
})
