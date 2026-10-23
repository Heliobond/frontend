import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import es from '../../messages/es.json'
import pt from '../../messages/pt.json'
import ar from '../../messages/ar.json'

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

function getLeafEntries(
  obj: Record<string, unknown>,
  prefix = '',
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null) {
      getLeafEntries(val as Record<string, unknown>, path, out)
    } else {
      out[path] = val
    }
  }
  return out
}

/** ICU argument names (`{name}`, `{count, plural, ...}`) used in a message. */
function getIcuArgs(message: string): string[] {
  const args = new Set<string>()
  for (const m of message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*[,}]/g)) args.add(m[1])
  return [...args].sort()
}

const IDENTICAL_ALLOWLIST = new Set<string>([
  'Landing.rowRegistry',
  'Landing.rowVault',
  'TaxReports.currencyFormat',
  'Creator.typeSolar',
  'ProjectDetail.backAriaHidden',
  'NotFound.code',
])

describe('Message catalog parity', () => {
  it.each([
    ['fr.json', fr],
    ['es.json', es],
    ['pt.json', pt],
    ['ar.json', ar],
  ] as const)('en.json and %s have identical key sets', (_name, catalog) => {
    const enKeys = getLeafKeys(en).sort()
    const catalogKeys = getLeafKeys(catalog).sort()
    const missingInCatalog = enKeys.filter((k) => !catalogKeys.includes(k))
    const missingInEn = catalogKeys.filter((k) => !enKeys.includes(k))
    const missing = [
      ...missingInCatalog.map((k) => `Missing in ${_name}: ${k}`),
      ...missingInEn.map((k) => `Missing in en.json: ${k}`),
    ]
    expect(missing).toEqual([])
  })

  it.each([
    ['fr.json', fr],
    ['es.json', es],
    ['pt.json', pt],
    ['ar.json', ar],
  ] as const)('%s uses the same ICU arguments as en.json for every key', (_name, catalog) => {
    const enEntries = getLeafEntries(en as Record<string, unknown>)
    const entries = getLeafEntries(catalog as Record<string, unknown>)
    const mismatches = Object.entries(enEntries)
      .filter(([key, val]) => typeof val === 'string' && typeof entries[key] === 'string')
      .filter(
        ([key, val]) =>
          getIcuArgs(val as string).join(',') !== getIcuArgs(entries[key] as string).join(','),
      )
      .map(([key]) => key)
    expect(mismatches).toEqual([])
  })

  it('uses rentabilidad del bono consistently for Spanish bond yield labels', () => {
    expect(es.Landing.returnRate).toBe('Rentabilidad del bono proyectada')
    expect(es.Deposit.projection).toContain('Rentabilidad del bono proyectada')
    expect(es.Landing.returnRate.toLowerCase()).not.toContain('rendimiento del bono')
    expect(es.Deposit.projection.toLowerCase()).not.toContain('rendimiento del bono')
  })

  it('Arabic plural messages cover all Arabic plural categories', () => {
    const arabicCategories = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])
    const pluralRe = /\{\s*\w+\s*,\s*plural\s*,([\s\S]*?)\}\s*$/
    const categoryRe = /(?:^|\s)(zero|one|two|few|many|other)\s*\{/g
    const mismatches: string[] = []

    function checkArabicPlurals(obj: Record<string, unknown>, prefix = '') {
      for (const key of Object.keys(obj)) {
        const path = prefix ? `${prefix}.${key}` : key
        const val = obj[key]
        if (typeof val === 'object' && val !== null) {
          checkArabicPlurals(val as Record<string, unknown>, path)
        } else if (typeof val === 'string') {
          const pluralMatch = val.match(pluralRe)
          if (pluralMatch) {
            const body = pluralMatch[1]
            const found = new Set<string>()
            for (const m of body.matchAll(categoryRe)) found.add(m[1])
            const missing = [...arabicCategories].filter((c) => !found.has(c))
            if (missing.length > 0) {
              mismatches.push(`${path}: missing ${missing.join(', ')}`)
            }
          }
        }
      }
    }

    checkArabicPlurals(ar as Record<string, unknown>)
    expect(mismatches).toEqual([])
  })

  it('does not ship untranslated English values in es.json', () => {
    const enEntries = getLeafEntries(en as Record<string, unknown>)
    const esEntries = getLeafEntries(es as Record<string, unknown>)

    const identical = Object.entries(esEntries).filter(
      ([key, val]) => typeof val === 'string' && enEntries[key] === val,
    )

    const longIdentical = identical.filter(([, val]) => (val as string).length > 6)
    const nonAllowlistedLong = longIdentical.filter(([key]) => !IDENTICAL_ALLOWLIST.has(key))
    const nonAllowlistedAny = identical.filter(([key]) => !IDENTICAL_ALLOWLIST.has(key))

    expect(nonAllowlistedLong).toEqual([])
    expect(nonAllowlistedAny).toEqual([])
    expect(identical.length).toBeLessThan(15)
  })
})
