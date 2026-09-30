import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import es from '../../messages/es.json'
import ar from '../../messages/ar.json'
import pt from '../../messages/pt.json'

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

const IDENTICAL_ALLOWLIST = new Set<string>([
  'Landing.rowRegistry',
  'Landing.rowVault',
  'TaxReports.currencyFormat',
  'Creator.typeSolar',
  'ProjectDetail.backAriaHidden',
])

describe('Message catalog parity', () => {
  it.each([
    ['fr.json', fr],
    ['es.json', es],
    ['ar.json', ar],
    ['pt.json', pt],
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

  it('uses rentabilidad del bono consistently for Spanish bond yield labels', () => {
    expect(es.Landing.returnRate).toBe('Rentabilidad del bono proyectada')
    expect(es.Deposit.projection).toContain('Rentabilidad del bono proyectada')
    expect(es.Landing.returnRate.toLowerCase()).not.toContain('rendimiento del bono')
    expect(es.Deposit.projection.toLowerCase()).not.toContain('rendimiento del bono')
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
