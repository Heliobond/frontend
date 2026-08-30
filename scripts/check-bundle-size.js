#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */

/**
 * Bundle size checker, tracks both the largest application chunk (landing
 * route with React Three Fiber) and the total JS bundle across all chunks.
 *
 * Budgets:
 *   - Landing chunk: 250 KB gzip
 *   - Total JS bundle: 600 KB gzip
 *
 * Reports the top 5 largest application chunks for visibility.
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const LANDING_BUDGET_KB = 250
const TOTAL_BUDGET_KB = 600

function walkSync(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSync(full, fileList)
    } else {
      fileList.push(full)
    }
  }
  return fileList
}

function getGzipSize(filePath) {
  const buffer = fs.readFileSync(filePath)
  return zlib.gzipSync(buffer).length
}

function formatBytes(bytes) {
  return (bytes / 1024).toFixed(2)
}

try {
  const chunksDir = path.join(process.cwd(), '.next/static/chunks')

  if (!fs.existsSync(chunksDir)) {
    console.error('❌ Build output not found. Run `bun run build` first.')
    process.exit(1)
  }

  const allJs = walkSync(chunksDir).filter((f) => f.endsWith('.js'))

  // Split into framework internals and application chunks
  const isFramework = (f) => {
    const name = path.basename(f)
    return (
      name.includes('webpack') ||
      name.includes('main-app') ||
      name.includes('framework') ||
      name.includes('polyfills') ||
      name.includes('_new-') ||
      name.includes('polyfill-')
    )
  }

  const appChunks = allJs.filter((f) => !isFramework(f))
  const frameworkChunks = allJs.filter(isFramework)

  if (appChunks.length === 0) {
    console.error('❌ Could not find any application chunks in', chunksDir)
    process.exit(1)
  }

  // Compute gzipped sizes for all chunks
  const appSizes = appChunks.map((f) => ({
    name: path.relative(chunksDir, f),
    raw: fs.statSync(f).size,
    gzip: getGzipSize(f),
  }))

  const totalAppGzip = appSizes.reduce((s, c) => s + c.gzip, 0)
  const totalAppRaw = appSizes.reduce((s, c) => s + c.raw, 0)

  let totalFrameworkGzip = 0
  for (const f of frameworkChunks) {
    totalFrameworkGzip += getGzipSize(f)
  }
  const totalAllGzip = totalAppGzip + totalFrameworkGzip

  // Largest chunk (landing route proxy)
  appSizes.sort((a, b) => b.gzip - a.gzip)
  const largest = appSizes[0]

  // Report
  console.log('\n📦 Bundle Size Report')
  console.log('─'.repeat(55))
  console.log(`  Largest app chunk:  ${formatBytes(largest.gzip)} KB gzip  (${largest.name})`)
  console.log(`  Total app JS:       ${formatBytes(totalAppGzip)} KB gzip  (${appSizes.length} chunks)`)
  console.log(`  Total JS (all):     ${formatBytes(totalAllGzip)} KB gzip`)
  console.log('─'.repeat(55))

  console.log('\n  Top 5 application chunks:')
  for (const c of appSizes.slice(0, 5)) {
    console.log(`    ${formatBytes(c.gzip).padStart(8)} KB  ${c.name}`)
  }

  let failed = false

  // Check landing chunk budget
  if (largest.gzip > LANDING_BUDGET_KB * 1024) {
    const over = formatBytes(largest.gzip - LANDING_BUDGET_KB * 1024)
    console.log(`\n❌ FAILED: Landing chunk ${formatBytes(largest.gzip)} KB exceeds budget ${LANDING_BUDGET_KB} KB (+${over} KB)`)
    failed = true
  }

  // Check total bundle budget
  if (totalAllGzip > TOTAL_BUDGET_KB * 1024) {
    const over = formatBytes(totalAllGzip - TOTAL_BUDGET_KB * 1024)
    console.log(`\n❌ FAILED: Total bundle ${formatBytes(totalAllGzip)} KB exceeds budget ${TOTAL_BUDGET_KB} KB (+${over} KB)`)
    failed = true
  }

  if (failed) {
    console.log('')
    process.exit(1)
  }

  const landingHeadroom = LANDING_BUDGET_KB - largest.gzip / 1024
  const totalHeadroom = TOTAL_BUDGET_KB - totalAllGzip / 1024
  console.log(`\n✅ PASSED: ${formatBytes(landingHeadroom * 1024)} KB landing headroom, ${formatBytes(totalHeadroom * 1024)} KB total headroom\n`)
  process.exit(0)
} catch (error) {
  console.error('❌ Error checking bundle size:', error.message)
  process.exit(1)
}
