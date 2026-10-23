import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import es from '../../messages/es.json'
import pt from '../../messages/pt.json'
import ar from '../../messages/ar.json'

type Catalog = Record<string, unknown>

function getLeafKeys(obj: Catalog, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null) {
      keys.push(...getLeafKeys(val as Catalog, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

function getLeafEntries(obj: Catalog, prefix = '', out: Catalog = {}): Catalog {
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null) {
      getLeafEntries(val as Catalog, path, out)
    } else {
      out[path] = val
    }
  }
  return out
}

interface IcuArgs {
  /** Argument name → ICU type (`argument`, `plural`, `select`, …). */
  types: Map<string, string>
  /** Plural/select argument name → category keys present in the message. */
  categories: Map<string, Set<string>>
}

/**
 * Walk an ICU message and collect argument names/types plus plural or select
 * categories. Branch bodies are parsed recursively, so literal words inside
 * plural branches (`one {live project}`) are never mistaken for arguments.
 */
function parseIcu(message: string, path: string): IcuArgs {
  const types = new Map<string, string>()
  const categories = new Map<string, Set<string>>()

  const fail = (at: number, reason: string): never => {
    throw new Error(`${path}: ICU parse error at ${at}: ${reason} — ${message}`)
  }

  const skipWs = (i: number, end: number): number => {
    while (i < end && /\s/.test(message[i])) i += 1
    return i
  }

  const readToken = (i: number, end: number, pattern: RegExp, what: string): [string, number] => {
    const match = pattern.exec(message.slice(i, end))
    if (!match) fail(i, `expected ${what}`)
    return [match[0], i + match[0].length]
  }

  /** Index just past the '}' matching the '{' at `open`. */
  const matchBrace = (open: number, end: number): number => {
    let depth = 0
    for (let i = open; i < end; i += 1) {
      if (message[i] === '{') depth += 1
      else if (message[i] === '}') {
        depth -= 1
        if (depth === 0) return i + 1
      }
    }
    return fail(open, 'unbalanced "{"')
  }

  const parseRange = (start: number, end: number): void => {
    let i = start
    while (i < end) {
      if (message[i] === '{') i = parsePlaceholder(i, end)
      else if (message[i] === '}') fail(i, 'unbalanced "}"')
      else i += 1
    }
  }

  const parsePlaceholder = (start: number, end: number): number => {
    let i = skipWs(start + 1, end)

    if (message[i] === '#') {
      i = skipWs(i + 1, end)
      if (message[i] !== '}') fail(i, 'expected "}" after "#"')
      return i + 1
    }

    const [name, afterName] = readToken(i, end, /^[A-Za-z_][\w]*/, 'identifier')
    i = skipWs(afterName, end)

    let type = 'argument'
    if (message[i] === ',') {
      i = skipWs(i + 1, end)
      const [parsedType, afterType] = readToken(i, end, /^[A-Za-z]+/, 'argument type')
      type = parsedType
      i = skipWs(afterType, end)
      if (i < end && message[i] === ',') i = skipWs(i + 1, end)

      if (type === 'plural' || type === 'select' || type === 'selectordinal') {
        if (type !== 'select' && message.startsWith('offset', i)) {
          i = skipWs(i + 6, end)
          const [digits, afterDigits] = readToken(i, end, /^\d+/, 'plural offset')
          void digits
          i = skipWs(afterDigits, end)
        }
        const seen = new Set<string>()
        while (i < end && message[i] !== '}') {
          const [key, afterKey] = readToken(i, end, /^[^\s{}]+/, 'option key')
          i = skipWs(afterKey, end)
          if (message[i] !== '{') fail(i, `expected "{" to open "${key}" branch`)
          const branchEnd = matchBrace(i, end)
          parseRange(i + 1, branchEnd - 1)
          i = skipWs(branchEnd, end)
          if (seen.has(key)) fail(start, `duplicate ${type} category "${key}"`)
          seen.add(key)
        }
        if (!seen.has('other')) {
          fail(start, `${type} for "${name}" is missing the required "other" branch`)
        }
        categories.set(name, seen)
      } else {
        while (i < end && message[i] !== '}') i += 1
      }
    }

    types.set(name, type)
    i = skipWs(i, end)
    if (message[i] !== '}') fail(i, 'expected "}" to close placeholder')
    return i + 1
  }

  parseRange(0, message.length)
  return { types, categories }
}

function argSignature(parsed: IcuArgs): string {
  return [...parsed.types.entries()]
    .map(([name, type]) => `${name}:${type}`)
    .sort()
    .join(',')
}

/**
 * Keys that are intentionally identical to English across locales: on-chain
 * contract names, format skeletons, brand copy, and UI tokens that are spelled
 * the same in French/Portuguese/Spanish.
 */
const IDENTICAL_ALLOWLIST = new Set<string>([
  'Landing.rowRegistry',
  'Landing.rowVault',
  'TaxReports.currencyFormat',
  'ProjectDetail.backAriaHidden',
  'NotFound.code',
  'AccountConflict.emailPlaceholder',
  'PasswordResetEmail.footerBrand',
  'Components.Toast.toneNeutral',
  'Components.Toast.toneError',
  'Components.Toast.statusLabel',
  'Creator.typeSolar',
  'Deposit.maxChip',
  'Withdraw.maxChip',
  'Deposit.memoLabel',
  'Deposit.rowMemo',
  'Admin.colType',
  'Admin.colActions',
  'Admin.pauseCta',
  'TaxReports.columnDistributions',
  'Nav.offline',
  'Shell.offlineBadge',
])

const NON_EN = [
  ['fr.json', fr, 'fr'],
  ['es.json', es, 'es'],
  ['pt.json', pt, 'pt'],
  ['ar.json', ar, 'ar'],
] as const

describe('Message catalog parity', () => {
  it.each(NON_EN)('en.json and %s have identical key sets', (_name, catalog) => {
    const enKeys = getLeafKeys(en as Catalog).sort()
    const catalogKeys = getLeafKeys(catalog as Catalog).sort()
    const missingInCatalog = enKeys.filter((k) => !catalogKeys.includes(k))
    const missingInEn = catalogKeys.filter((k) => !enKeys.includes(k))
    const missing = [
      ...missingInCatalog.map((k) => `Missing in ${_name}: ${k}`),
      ...missingInEn.map((k) => `Missing in en.json: ${k}`),
    ]
    expect(missing).toEqual([])
  })

  it.each(NON_EN)(
    '%s uses the same ICU argument names and types as en.json',
    (_name, catalog) => {
      const enEntries = getLeafEntries(en as Catalog)
      const entries = getLeafEntries(catalog as Catalog)
      const mismatches: string[] = []

      for (const [key, val] of Object.entries(enEntries)) {
        if (typeof val !== 'string') continue
        const other = entries[key]
        if (typeof other !== 'string') continue
        try {
          const enParsed = parseIcu(val, `en.json:${key}`)
          const otherParsed = parseIcu(other, `${_name}:${key}`)
          if (argSignature(enParsed) !== argSignature(otherParsed)) {
            mismatches.push(
              `${key}: en [${argSignature(enParsed)}] vs ${_name} [${argSignature(otherParsed)}]`,
            )
          }
        } catch (error) {
          mismatches.push(error instanceof Error ? error.message : String(error))
        }
      }

      expect(mismatches).toEqual([])
    },
  )

  it('does not misread literal words inside plural branches as arguments', () => {
    for (const key of ['Admin.liveProject', 'TaxReports.skippedAlert']) {
      const [namespace, leaf] = key.split('.')
      const enMessage = (en as Catalog)[namespace] as Catalog
      const parsed = parseIcu(enMessage[leaf] as string, `en.json:${key}`)
      expect([...parsed.types.keys()]).toEqual(['count'])
      expect(parsed.types.get('count')).toBe('plural')

      for (const [name, catalog] of [
        ['fr', fr],
        ['es', es],
        ['pt', pt],
        ['ar', ar],
      ] as const) {
        const message = (catalog as Catalog)[namespace] as Catalog
        const other = parseIcu(message[leaf] as string, `${name}:${key}`)
        expect(argSignature(other), `${name}:${key}`).toBe(argSignature(parsed))
      }
    }
  })

  it('reports a clear error for malformed or incomplete plurals', () => {
    expect(() => parseIcu('{count, plural, one {# item}}', 'test:missingOther')).toThrow(
      /missing the required "other" branch/,
    )
    expect(() => parseIcu('{count, plural, one {# item} other', 'test:truncated')).toThrow(
      /ICU parse error/,
    )
    expect(() => parseIcu('{count, plural, one {# a} other {# b}}}', 'test:extra')).toThrow(
      /unbalanced/,
    )
    expect(() => parseIcu('{count, plural, one {# a} one {# b} other {# c}}', 'test:dup')).toThrow(
      /duplicate/,
    )
  })

  it('uses rentabilidad del bono consistently for Spanish bond yield labels', () => {
    expect(es.Landing.returnRate).toBe('Rentabilidad del bono proyectada')
    expect(es.Deposit.projection).toContain('Rentabilidad del bono proyectada')
    expect(es.Landing.returnRate.toLowerCase()).not.toContain('rendimiento del bono')
    expect(es.Deposit.projection.toLowerCase()).not.toContain('rendimiento del bono')
  })

  it.each(NON_EN)(
    '%s plural messages cover every CLDR plural category for the locale',
    (_name, catalog, locale) => {
      const required = new Set(
        new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
      )
      const mismatches: string[] = []
      const entries = getLeafEntries(catalog as Catalog)

      for (const [key, val] of Object.entries(entries)) {
        if (typeof val !== 'string') continue
        let parsed: IcuArgs
        try {
          parsed = parseIcu(val, `${_name}:${key}`)
        } catch (error) {
          mismatches.push(error instanceof Error ? error.message : String(error))
          continue
        }
        for (const [arg, found] of parsed.categories) {
          const argType = parsed.types.get(arg)
          if (argType !== 'plural' && argType !== 'selectordinal') continue
          const missing = [...required].filter((c) => !found.has(c))
          if (missing.length > 0) {
            mismatches.push(`${key} (${arg}): missing ${missing.join(', ')}`)
          }
        }
      }

      expect(mismatches).toEqual([])
    },
  )

  it.each(NON_EN)(
    'does not ship untranslated English values in %s',
    (_name, catalog) => {
      const enEntries = getLeafEntries(en as Catalog)
      const entries = getLeafEntries(catalog as Catalog)

      const identical = Object.entries(entries).filter(
        ([key, val]) => typeof val === 'string' && enEntries[key] === val,
      )
      const nonAllowlisted = identical.filter(([key]) => !IDENTICAL_ALLOWLIST.has(key))

      expect(nonAllowlisted.map(([key, val]) => `${key}: ${val}`)).toEqual([])
    },
  )
})
