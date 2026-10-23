#!/usr/bin/env node

/**
 * Unused and dynamic i18n key detector (#906).
 *
 * Collects every `t('...')` / `tc('...')` literal from source files and
 * compares them against the en.json catalog keys. Reports:
 *
 *   1. Catalog keys that are never referenced (exit 1 — CI fails).
 *   2. Dynamic key usages `t(`...`)` that bypass static checking (warn only).
 *
 * A key counts as used when it appears in a `t()` literal, matches a dynamic
 * `t(`edu${i}Title`)` template, or appears as a quoted string anywhere in source
 * (error-code tables and namespace lookups reach keys without calling `t('...')`).
 *
 * Keys that were already unused when this check landed are listed in
 * scripts/unused-keys-baseline.json, so the gate only fails on NEW unused keys.
 * It also fails when a baseline entry is now used or no longer exists, so the
 * list can only shrink. Delete a key from every locale and from the baseline
 * together. Run with --update-baseline to rewrite it after a cleanup.
 *
 * Exits 1 when the check fails, 0 otherwise.
 */

import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.join(process.cwd(), 'src')
const MESSAGES_PATH = path.join(process.cwd(), 'messages', 'en.json')
const BASELINE_PATH = path.join(process.cwd(), 'scripts', 'unused-keys-baseline.json')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

/** Any quoted string in source, e.g. the 'vault_Paused' entries of an error-code table. */
const QUOTED_STRING_RE = /['"`]([\w.]+)['"`]/g

/** Match `t('...')`, `tc('...')`, `tErr('...')`, `t.rich('...')` with a string literal. */
const STATIC_KEY_RE = /\bt(?:c|Err|\.(?:rich|markup|raw))?\(\s*['"`]([\w.]+)['"`]/g

/** Match `t(`...`)` / `t.rich(`...`)` with a template literal (dynamic key). */
const DYNAMIC_KEY_RE = /\bt(?:c|Err|\.(?:rich|markup|raw))?\(\s*`([^`]*)`/g

function walkSync(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSync(full, fileList)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue
      fileList.push(full)
    }
  }
  return fileList
}

function getLeafKeys(obj, prefix = '') {
  const keys = []
  for (const key of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null) {
      keys.push(...getLeafKeys(val, p))
    } else {
      keys.push(p)
    }
  }
  return keys
}

try {
  const catalog = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'))
  const catalogKeys = getLeafKeys(catalog)
  const catalogSet = new Set(catalogKeys)

  const files = walkSync(SRC_DIR)
  const usedSuffixes = new Set()
  const usedFullKeys = new Set()
  const quotedStrings = new Set()
  const dynamicPatterns = []
  const dynamicUsages = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const rel = path.relative(process.cwd(), file)

    for (const m of content.matchAll(STATIC_KEY_RE)) {
      const raw = m[1]
      usedFullKeys.add(raw)
      // Also record the last segment for bare-key matching.
      const parts = raw.split('.')
      usedSuffixes.add(parts[parts.length - 1])
    }

    for (const m of content.matchAll(QUOTED_STRING_RE)) quotedStrings.add(m[1])

    for (const m of content.matchAll(DYNAMIC_KEY_RE)) {
      const expr = m[1]
      const line = content.slice(0, m.index).split('\n').length
      dynamicUsages.push({ file: rel, line, expr })
      // `edu${i}Title` covers every key whose path ends in edu<anything>Title.
      const source = expr.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]*\}/g, '\\w+')
      dynamicPatterns.push(new RegExp(`(^|\\.)${source}$`))
    }
  }

  // Report dynamic key usages (warn only).
  if (dynamicUsages.length > 0) {
    console.log(`\n⚠  Dynamic key usages (${dynamicUsages.length}) — review manually:\n`)
    for (const u of dynamicUsages) {
      console.log(`  ${u.file}:${u.line}  t(\`${u.expr}\`)`)
    }
  }

  // Find unused catalog keys: a key is used if its full path or its last
  // segment appears in a static t() call.
  const unused = catalogKeys
    .filter((k) => {
      if (usedFullKeys.has(k)) return false
      const last = k.split('.').pop()
      if (usedSuffixes.has(last) || quotedStrings.has(k) || quotedStrings.has(last)) return false
      const tails = k.split('.').map((_, i, parts) => parts.slice(i).join('.'))
      return !dynamicPatterns.some((re) => tails.some((tail) => re.test(tail)))
    })
    .sort()

  if (UPDATE_BASELINE) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(unused, null, 2)}\n`)
    console.log(
      `\nWrote ${unused.length} unused keys to ${path.relative(process.cwd(), BASELINE_PATH)}.`,
    )
    process.exit(0)
  }

  const baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')))
  const unusedSet = new Set(unused)
  const added = unused.filter((k) => !baseline.has(k))
  const stale = [...baseline].filter((k) => !unusedSet.has(k)).sort()

  if (added.length > 0 || stale.length > 0) {
    if (added.length > 0) {
      console.error(`\n✗  Unused catalog keys not in the baseline (${added.length}):\n`)
      for (const k of added) console.error(`  ${k}`)
      console.error(`\nRemove these keys from messages/*.json or reference them in source.`)
    }
    if (stale.length > 0) {
      console.error(
        `\n✗  Baseline entries that are now used or no longer exist (${stale.length}):\n`,
      )
      for (const k of stale) console.error(`  ${k}`)
      console.error(`\nRun: node scripts/check-unused-keys.mjs --update-baseline`)
    }
    process.exit(1)
  }

  console.log(
    `\n✓  No new unused catalog keys (${baseline.size} known, listed in scripts/unused-keys-baseline.json).`,
  )
  if (dynamicUsages.length > 0) {
    console.log(`  (${dynamicUsages.length} dynamic key usages listed above for review)`)
  }
} catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}
