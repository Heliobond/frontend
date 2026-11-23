#!/usr/bin/env node

/**
 * Type coverage checker, enforces zero `any` usage in source files.
 *
 * Scans all .ts and .tsx files under src/ for explicit `any` type annotations.
 * Detection uses the TypeScript parser and looks for AnyKeyword syntax nodes,
 * so comments, string contents and prose are never mistaken for a type — and a
 * quoted property such as `"label": any` is caught instead of being skipped.
 *
 * Exits 1 if any `any` types are found.
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const SRC_DIR = path.join(process.cwd(), 'src')

function walkSync(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSync(full, fileList)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      // Skip test files
      if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue
      fileList.push(full)
    }
  }
  return fileList
}

function checkFile(filePath) {
  const rel = path.relative(process.cwd(), filePath)
  const content = fs.readFileSync(filePath, 'utf-8')
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )
  const lines = content.split('\n')
  const hitsByLine = new Set()

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      // One hit per line is enough for the report.
      hitsByLine.add(line)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return [...hitsByLine]
    .sort((a, b) => a - b)
    .map((line) => `${rel}:${line + 1}: ${lines[line].trim()}`)
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
