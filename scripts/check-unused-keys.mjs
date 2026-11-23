#!/usr/bin/env node

/**
 * Unused and dynamic i18n key detector (#906).
 *
 * Collects every translation call from source files and compares the resolved
 * keys against the en.json catalog. Reports:
 *
 *   1. Catalog keys that are never referenced (exit 1 — CI fails).
 *   2. Dynamic key usages `t(`...`)` that bypass static checking (warn only).
 *
 * A translator is scoped to its namespace: `useTranslations('Creator')` makes
 * `t('title')` mean `Creator.title`, NOT every `*.title` key in the catalog.
 * Matching only the last segment made a newly added key in another namespace
 * look used as soon as any translator referenced a key with the same name.
 *
 * Dynamic keys are matched only inside the namespace of their translator, so
 * table-driven keys (`type${pt}`, `criteria${i}`, `edu${i}Title`, …) stay
 * recognized where they are used without leaking into other namespaces.
 * A few source files hold bare message keys in known tables instead of calling
 * a translator; those tables are listed explicitly below.
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

/** `const t = useTranslations('Creator')` / `const t = await getTranslations('Metadata')`. */
const TRANSLATOR_DECL_RE =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*(?:['"]([^'"]*)['"]|`([^`]*)`)?\s*\)/g

/** `t('key')`, `t.rich('key')`, `tErr('key')`, … with a string literal. */
const STATIC_CALL_RE = /\b([A-Za-z_$][\w$]*)(?:\.(?:rich|markup|raw))?\s*\(\s*(['"`])([\w.]+)\2/g

/** `t(`...`)` / `t.rich(`...`)` with a template literal (dynamic key). */
const DYNAMIC_CALL_RE = /\b([A-Za-z_$][\w$]*)(?:\.(?:rich|markup|raw))?\s*\(\s*`([^`]*)`/g

/** Any quoted string, e.g. the 'vault_Paused' entries of an error-code table. */
const QUOTED_STRING_RE = /['"`]([\w.]+)['"`]/g

/**
 * Source files whose quoted strings are bare message keys of a known namespace.
 * These reach a translator indirectly (error-code tables, code→message maps).
 */
const BARE_KEY_TABLES = {
  'src/components/Toast.tsx': ['Components.Toast'],
  'src/hooks/usePortfolio.ts': ['Errors'],
  'src/lib/contractErrorCodes.ts': ['ContractErrors'],
  'src/lib/contractErrors.ts': ['ContractErrors'],
  'src/lib/errorMessages.ts': ['Errors'],
  'src/lib/kycValidation.ts': ['Kyc.errors'],
  'src/lib/stellarPayment.ts': ['Errors'],
  'src/lib/webauthn.ts': ['Errors'],
  'src/screens/creator/CreatorDashboard.tsx': ['Creator'],
  'src/shell/TopBar.tsx': ['Nav'],
  'src/wallet/admin.ts': ['Errors'],
  'src/wallet/useUsdcBalance.ts': ['Errors'],
  'src/wallet/useVault.ts': ['Errors'],
  'src/wallet/useVaultLimits.ts': ['Errors'],
}

/**
 * Helpers that receive a translator as a parameter instead of creating one.
 * Their calls cannot be bound from a declaration, so the namespace is declared
 * here explicitly (this is how route metadata reaches `Metadata.*` keys).
 */
const PARAM_TRANSLATOR_NAMESPACES = {
  'src/lib/routeMetadata.ts': { t: 'Metadata' },
}

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

/** Return every suffix of a key ("a.b.c" → ["a.b.c", "b.c", "c"]). */
function tails(key) {
  return key.split('.').map((_, i, parts) => parts.slice(i).join('.'))
}

/** Which translator declaration was in scope at this call site? */
function namespaceAt(declarations, name, index) {
  let match = null
  for (const decl of declarations) {
    if (decl.name === name && decl.index <= index && (!match || decl.index > match.index)) {
      match = decl
    }
  }
  return match
}

/**
 * Resolve a literal key against the namespace in scope. A key that is already
 * a full catalog path (e.g. `Errors.timeout`) stays as-is; otherwise it is
 * prefixed with the translator's namespace.
 */
function resolveStaticKey(namespace, key, catalogSet) {
  if (!namespace || catalogSet.has(key)) return key
  return `${namespace}.${key}`
}

/** Turn `edu${i}Title` into an anchored regex that matches `edu1Title`. */
function dynamicRegex(expression) {
  const source = expression.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]*\}/g, '.*')
  return new RegExp(`^${source}$`)
}

/**
 * The parts of a catalog key a dynamic pattern may match. Patterns are scoped
 * to their translator's namespace; a translator with no declaration in the
 * file (a translator passed in as an argument) may match a full path only.
 */
function dynamicCandidates(key, namespace) {
  if (!namespace) return [key]
  const prefix = `${namespace}.`
  if (!key.startsWith(prefix)) return []
  return tails(key.slice(prefix.length))
}

try {
  const catalog = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'))
  const catalogKeys = getLeafKeys(catalog)
  const catalogSet = new Set(catalogKeys)

  const files = walkSync(SRC_DIR)
  const usedFullKeys = new Set()
  const dynamicPatterns = []
  const dynamicUsages = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const rel = path.relative(process.cwd(), file)

    // Declarations first: a call binds to the most recent declaration of the
    // same variable above it, so two translators in one file stay independent.
    const declarations = []
    for (const m of content.matchAll(TRANSLATOR_DECL_RE)) {
      declarations.push({
        name: m[1],
        namespace: m[2] ?? m[3] ?? '',
        index: m.index,
      })
    }
    const paramNamespaces = PARAM_TRANSLATOR_NAMESPACES[rel] ?? {}

    /** Namespace in scope for one call, including parameter translators. */
    const namespaceFor = (variable, index) => {
      const decl = namespaceAt(declarations, variable, index)
      if (decl) return { known: true, namespace: decl.namespace }
      if (variable in paramNamespaces) return { known: true, namespace: paramNamespaces[variable] }
      return { known: false, namespace: undefined }
    }

    for (const m of content.matchAll(STATIC_CALL_RE)) {
      const [, variable, , key] = m
      const scope = namespaceFor(variable, m.index)
      // An unscoped bare key would match the same last segment in every
      // namespace — exactly the ambiguity this detector must avoid.
      if (!scope.known && !key.includes('.')) continue
      usedFullKeys.add(resolveStaticKey(scope.namespace, key, catalogSet))
    }

    for (const m of content.matchAll(DYNAMIC_CALL_RE)) {
      const [, variable, expression] = m
      const scope = namespaceFor(variable, m.index)
      if (!scope.known) continue
      const line = content.slice(0, m.index).split('\n').length
      dynamicUsages.push({ file: rel, line, expression })
      dynamicPatterns.push({ namespace: scope.namespace, regex: dynamicRegex(expression) })
    }

    const bareNamespaces = BARE_KEY_TABLES[rel]
    for (const m of content.matchAll(QUOTED_STRING_RE)) {
      const quoted = m[1]
      // Full paths are unambiguous. Bare strings only count in a known table.
      if (catalogSet.has(quoted)) usedFullKeys.add(quoted)
      for (const namespace of bareNamespaces ?? []) {
        const full = `${namespace}.${quoted}`
        if (catalogSet.has(full)) usedFullKeys.add(full)
      }
    }
  }

  // Report dynamic key usages (warn only).
  if (dynamicUsages.length > 0) {
    console.log(`\n⚠  Dynamic key usages (${dynamicUsages.length}) — review manually:\n`)
    for (const u of dynamicUsages) {
      console.log(`  ${u.file}:${u.line}  t(\`${u.expression}\`)`)
    }
  }

  const unused = catalogKeys
    .filter(
      (key) =>
        !usedFullKeys.has(key) &&
        !dynamicPatterns.some(({ namespace, regex }) =>
          dynamicCandidates(key, namespace).some((candidate) => regex.test(candidate)),
        ),
    )
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
