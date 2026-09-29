import { describe, expect, test, vi, beforeEach } from 'vitest'
import { getSiteUrl } from '../siteUrl'

describe('getSiteUrl', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL
  })

  test('uses NEXT_PUBLIC_SITE_URL when set', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    expect(getSiteUrl()).toBe('https://example.com')
  })

  test('falls back to VERCEL_PROJECT_PRODUCTION_URL', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'heliobond.vercel.app'
    expect(getSiteUrl()).toBe('https://heliobond.vercel.app')
  })

  test('falls back to VERCEL_URL for preview', () => {
    process.env.VERCEL_URL = 'preview-abc.heliobond.vercel.app'
    expect(getSiteUrl()).toBe('https://preview-abc.heliobond.vercel.app')
  })

  test('defaults to localhost:3000 when no env is set', () => {
    expect(getSiteUrl()).toBe('http://localhost:3000')
  })

  test('trims whitespace from env values', () => {
    process.env.NEXT_PUBLIC_SITE_URL = '  https://spaced.com  '
    expect(getSiteUrl()).toBe('https://spaced.com')
  })

  test('NEXT_PUBLIC_SITE_URL takes priority over Vercel envs', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://explicit.com'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'vercel.app'
    expect(getSiteUrl()).toBe('https://explicit.com')
  })
})
