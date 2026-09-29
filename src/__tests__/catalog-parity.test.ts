import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import es from '../../messages/es.json'
import ar from '../../messages/ar.json'
import pt from '../../messages/pt.json'
import { LOCALES } from '../../i18n/config'

// Map locale code → imported catalog
const CATALOGS: Record<string, Record<string, unknown>> = {
  en,
  fr,
  es,
  ar,
  pt,
}

function getLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null) {
      keys.push(...getLeafKeys(val as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

/**
 * Extract ICU placeholder names from a message string.
 * e.g. "Hello {name}, you have {count} items" → ['count', 'name']
 */
function extractPlaceholders(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const matches = value.match(/\{(\w+)\}/g) ?? []
  return matches.map((m) => m.slice(1, -1)).sort()
}

// Non-English locales to check (auto-includes new ones from LOCALES)
const NON_EN_LOCALES = LOCALES.filter((l) => l !== 'en')

describe('Message catalog parity', () => {
  // Key-set parity: every locale must have the same keys as en.json
  // Auto-includes pt.json and any future locale added to LOCALES (#650)
  it.each(NON_EN_LOCALES.map((l) => [`${l}.json`, CATALOGS[l]] as const))(
    'en.json and %s have identical key sets',
    (_name, catalog) => {
      const enKeys = getLeafKeys(en).sort()
      const catalogKeys = getLeafKeys(catalog).sort()
      const missingInCatalog = enKeys.filter((k) => !catalogKeys.includes(k))
      const missingInEn = catalogKeys.filter((k) => !enKeys.includes(k))
      const missing = [
        ...missingInCatalog.map((k) => `Missing in ${_name}: ${k}`),
        ...missingInEn.map((k) => `Missing in en.json: ${k}`),
      ]
      expect(missing).toEqual([])
    },
  )

  // ICU placeholder parity: translation placeholders must match English (#650)
  it.each(NON_EN_LOCALES.map((l) => [l, CATALOGS[l]] as const))(
    '%s: ICU placeholders match en.json for every key',
    (_locale, catalog) => {
      const enKeys = getLeafKeys(en)
      const mismatches: string[] = []
      for (const key of enKeys) {
        const enVal = getLeafValue(en, key)
        const locVal = getLeafValue(catalog, key)
        if (typeof enVal !== 'string' || typeof locVal !== 'string') continue
        const enPlaceholders = extractPlaceholders(enVal)
        const locPlaceholders = extractPlaceholders(locVal)
        if (enPlaceholders.length > 0 || locPlaceholders.length > 0) {
          if (JSON.stringify(enPlaceholders) !== JSON.stringify(locPlaceholders)) {
            mismatches.push(`${key}: en has {${enPlaceholders.join(', ')}}, ${_locale} has {${locPlaceholders.join(', ')}}`)
          }
        }
      }
      expect(mismatches).toEqual([])
    },
  )

  it('uses rentabilidad del bono consistently for Spanish bond yield labels', () => {
    expect(es.Landing.returnRate).toBe('Rentabilidad del bono proyectada')
    expect(es.Deposit.projection).toContain('Rentabilidad del bono proyectada')
    expect(es.Landing.returnRate.toLowerCase()).not.toContain('rendimiento del bono')
    expect(es.Deposit.projection.toLowerCase()).not.toContain('rendimiento del bono')
  })
})

/** Get the value at a dotted path in a nested object, or undefined. */
function getLeafValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
