import { describe, it, expect, vi, afterEach } from 'vitest'
import en from '../../messages/en.json'
import { getMessageFallback, mergeCatalogs, withEnglishFallback } from './fallback'

type Loose = Record<string, Record<string, string>>

describe('i18n English fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fills missing keys from the English catalog per key', () => {
    const merged = withEnglishFallback({
      Nav: { explore: 'Explorar', account: 'Conta' },
    }) as unknown as Loose

    expect(merged.Nav.explore).toBe('Explorar')
    expect(merged.Nav.account).toBe('Conta')
    // Missing leaf falls back to English rather than the raw key path.
    expect(merged.Nav.disconnect).toBe(en.Nav.disconnect)
  })

  it('does not clobber a translated value when the namespace is partial', () => {
    const merged = mergeCatalogs(
      { Nav: { explore: 'EN', copied: 'EN' }, Footer: { learn: 'EN' } },
      { Nav: { explore: 'PT' } },
    )
    expect(merged).toEqual({
      Nav: { explore: 'PT', copied: 'EN' },
      Footer: { learn: 'EN' },
    })
  })

  it('returns English copy for a missing message, not Namespace.key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(getMessageFallback({ namespace: 'Nav', key: 'disconnect' })).toBe(en.Nav.disconnect)
    expect(warn).toHaveBeenCalled()
  })

  it('returns the dotted path only when English has no copy either', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(getMessageFallback({ namespace: 'Nope', key: 'missing' })).toBe('Nope.missing')
    expect(getMessageFallback({ key: 'alsoMissing' })).toBe('alsoMissing')
  })
})
