import { describe, expect, it } from 'vitest'
import { isSupportedLocale, negotiateLocale, parseAcceptLanguage } from './negotiate'

describe('parseAcceptLanguage', () => {
  it('orders tags by q-value', () => {
    expect(parseAcceptLanguage('en;q=0.5,fr;q=0.9,es')).toEqual([
      { lang: 'es', quality: 1 },
      { lang: 'fr', quality: 0.9 },
      { lang: 'en', quality: 0.5 },
    ])
  })

  it('defaults missing q to 1 and lowercases tags', () => {
    expect(parseAcceptLanguage('FR-ca')).toEqual([{ lang: 'fr-ca', quality: 1 }])
  })

  it('drops malformed entries', () => {
    expect(parseAcceptLanguage('en;q=abc,fr')).toEqual([
      { lang: 'en', quality: 1 },
      { lang: 'fr', quality: 1 },
    ])
  })
})

describe('negotiateLocale (#895)', () => {
  it('matches region tags to the primary language (pt-PT → pt)', () => {
    expect(negotiateLocale('pt-PT,pt;q=0.9')).toBe('pt')
  })

  it('matches fr-CA to French', () => {
    expect(negotiateLocale('fr-CA,fr;q=0.9,en;q=0.8')).toBe('fr')
  })

  it('honours q-values when choosing between candidates', () => {
    expect(negotiateLocale('fr;q=0.4,es;q=0.9')).toBe('es')
    expect(negotiateLocale('fr;q=0.9,es;q=0.4')).toBe('fr')
  })

  it('falls back to the default for unknown languages', () => {
    expect(negotiateLocale('de-DE,ja;q=0.8')).toBe('en')
  })

  it('falls back to the default for empty or wildcard headers', () => {
    expect(negotiateLocale(null)).toBe('en')
    expect(negotiateLocale('')).toBe('en')
    expect(negotiateLocale('*')).toBe('en')
    expect(negotiateLocale('*,en;q=0.1')).toBe('en')
  })

  it('skips zero-quality tags', () => {
    expect(negotiateLocale('fr;q=0,es;q=0.5')).toBe('es')
  })
})

describe('isSupportedLocale', () => {
  it('accepts every catalog locale and rejects others', () => {
    for (const locale of ['en', 'fr', 'es', 'ar', 'pt']) {
      expect(isSupportedLocale(locale)).toBe(true)
    }
    expect(isSupportedLocale('de')).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
    expect(isSupportedLocale(null)).toBe(false)
    expect(isSupportedLocale('EN')).toBe(false)
  })
})
