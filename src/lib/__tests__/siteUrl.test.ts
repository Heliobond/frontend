import { describe, it, expect, beforeEach, afterEach } from '@/test/bun'
import { getSiteUrl } from '../siteUrl'

describe('getSiteUrl', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  it('returns NEXT_PUBLIC_SITE_URL when set', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'vercel-prod.app'
    process.env.VERCEL_URL = 'vercel-preview.app'

    expect(getSiteUrl()).toBe('https://example.com')
  })

  it('falls back to VERCEL_PROJECT_PRODUCTION_URL when NEXT_PUBLIC_SITE_URL is not set', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'heliobond.vercel.app'
    process.env.VERCEL_URL = 'preview-branch.vercel.app'

    expect(getSiteUrl()).toBe('https://heliobond.vercel.app')
  })

  it('falls back to VERCEL_URL when neither NEXT_PUBLIC_SITE_URL nor VERCEL_PROJECT_PRODUCTION_URL is set', () => {
    process.env.VERCEL_URL = 'preview-branch.vercel.app'

    expect(getSiteUrl()).toBe('https://preview-branch.vercel.app')
  })

  it('defaults to localhost when no environment variables are set', () => {
    expect(getSiteUrl()).toBe('http://localhost:3000')
  })

  it('respects NEXT_PUBLIC_SITE_URL with http protocol', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://staging.example.com'

    expect(getSiteUrl()).toBe('http://staging.example.com')
  })

  it('adds https protocol to VERCEL_PROJECT_PRODUCTION_URL', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'my-app.vercel.app'

    const result = getSiteUrl()
    expect(result).toBe('https://my-app.vercel.app')
    expect(result.startsWith('https://')).toBe(true)
  })

  it('adds https protocol to VERCEL_URL', () => {
    process.env.VERCEL_URL = 'my-app-git-feature.vercel.app'

    const result = getSiteUrl()
    expect(getSiteUrl()).toBe('https://my-app-git-feature.vercel.app')
    expect(result.startsWith('https://')).toBe(true)
  })

  it('handles empty string environment variables by falling to next priority', () => {
    process.env.NEXT_PUBLIC_SITE_URL = ''
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'production.vercel.app'

    // Empty string is falsy, so should fall back to next priority
    expect(getSiteUrl()).toBe('https://production.vercel.app')
  })

  it('normalizes trailing slashes on NEXT_PUBLIC_SITE_URL (#1002)', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com/'
    expect(getSiteUrl()).toBe('https://example.com')

    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com///'
    expect(getSiteUrl()).toBe('https://example.com')
  })

  it('normalizes trailing slashes on Vercel deployment URLs (#1002)', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.vercel.app/'
    expect(getSiteUrl()).toBe('https://prod.vercel.app')

    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    process.env.VERCEL_URL = 'preview.vercel.app///'
    expect(getSiteUrl()).toBe('https://preview.vercel.app')
  })

  it('produces the same result for equivalent origins with or without trailing slash (#1002)', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://heliobond.fi'
    const withoutSlash = getSiteUrl()

    process.env.NEXT_PUBLIC_SITE_URL = 'https://heliobond.fi/'
    const withSlash = getSiteUrl()

    expect(withSlash).toBe(withoutSlash)
    expect(`${withSlash}/sitemap.xml`).toBe('https://heliobond.fi/sitemap.xml')
  })
})
