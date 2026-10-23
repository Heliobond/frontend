import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

describe('request security proxy (#723)', () => {
  it('adds a per-request nonce to the CSP response', () => {
    const first = proxy(new NextRequest('https://heliobond.example/'))
    const second = proxy(new NextRequest('https://heliobond.example/'))
    const header = 'Content-Security-Policy-Report-Only'
    const firstCsp = first.headers.get(header)
    const secondCsp = second.headers.get(header)

    expect(firstCsp).toMatch(/nonce-[A-Za-z0-9+/=_-]+/)
    expect(secondCsp).toMatch(/nonce-[A-Za-z0-9+/=_-]+/)
    expect(firstCsp).not.toBe(secondCsp)
  })
})

describe('first-visit locale negotiation (#895)', () => {
  const run = (headers: Record<string, string> = {}, cookie?: string) => {
    const requestHeaders = new Headers(headers)
    if (cookie) requestHeaders.set('cookie', cookie)
    return proxy(new NextRequest('https://heliobond.example/', { headers: requestHeaders }))
  }

  it('sets NEXT_LOCALE from Accept-Language when no cookie is present', () => {
    const response = run({ 'accept-language': 'fr-CA,fr;q=0.9,en;q=0.8' })
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('fr')
  })

  it('does not set a cookie for an English default match', () => {
    const response = run({ 'accept-language': 'en-US,en;q=0.9' })
    expect(response.cookies.get('NEXT_LOCALE')).toBeUndefined()
  })

  it('does not set a cookie for an unmatched language', () => {
    const response = run({ 'accept-language': 'de-DE,ja;q=0.8' })
    expect(response.cookies.get('NEXT_LOCALE')).toBeUndefined()
  })

  it('leaves an explicit language-switcher cookie untouched', () => {
    const response = run({ 'accept-language': 'fr-CA' }, 'NEXT_LOCALE=en')
    expect(response.cookies.get('NEXT_LOCALE')).toBeUndefined()
  })

  it('replaces an invalid cookie value with the negotiated locale', () => {
    const response = run({ 'accept-language': 'ar' }, 'NEXT_LOCALE=de')
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('ar')
  })
})

