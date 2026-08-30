#!/usr/bin/env node

/**
 * Type coverage checker, enforces zero `any` usage in source files.
 *
 * Scans all .ts and .tsx files under src/ for the `any` type keyword.
 * Skips comments, strings, and the word "any" in prose (e.g. "before any money
 * moves"). Only matches `any` when used as a TypeScript type annotation.
 *
 * Exits 1 if any `any` types are found.
 */

const fs = require('fs')
const path = require('path')

const SRC_DIR = path.join(process.cwd(), 'src')

/** Match `any` used as a type (after `:`, `as`, or generic constraints). */
const TYPE_ANY_RE = /(?:[:<>,\s])\bany\b(?:[^a-zA-Z0-9_$]|$)/g

/** Lines that are pure comments or string content, skip them. */
const COMMENT_LINE_RE = /^\s*(?:\/\/.*|\/\*.*\*\/|\*|#)/
const STRING_LINE_RE = /^\s*["'`]/

function walkSync(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSync(full, fileList)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      fileList.push(full)
    }
  }
  return fileList
}

function checkFile(filePath) {
  const rel = path.relative(process.cwd(), filePath)
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const hits = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (COMMENT_LINE_RE.test(line)) continue
    if (STRING_LINE_RE.test(line)) continue

    // Skip lines that are only i18n message content
    if (line.includes('"any ') || line.includes("'any ") || line.includes('`any '))
      continue

    const matches = line.matchAll(TYPE_ANY_RE)
    for (const m of matches) {
      // Verify it's not inside a comment mid-line
      const before = line.slice(0, m.index)
      if (before.includes('//')) continue
      hits.push({ line: i + 1, text: line.trim() })
      break // one hit per line is enough
    }
  }

  return hits.map((h) => `${rel}:${h.line}: ${h.text}`)
}

try {
  const files = walkSync(SRC_DIR)
  const allHits = []

  for (const f of files) {
    allHits.push(...checkFile(f))
  }

  if (allHits.length > 0) {
    console.log('\n❌ Found `any` types in source files:\n')
    for (const h of allHits) {
      console.log(`  ${h}`)
    }
    console.log(`\n${allHits.length} file(s) with \`any\` types. Replace with proper types.\n`)
    process.exit(1)
  }

  console.log('✅ No `any` types found in source files.\n')
  process.exit(0)
} catch (error) {
  console.error('❌ Error checking type coverage:', error.message)
  process.exit(1)
}
