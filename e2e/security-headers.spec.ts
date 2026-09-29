import { test, expect } from '@playwright/test'

const ROUTES = ['/', '/explore', '/connect', '/deposit', '/withdraw']

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
