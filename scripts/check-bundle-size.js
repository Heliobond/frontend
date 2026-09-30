#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Bundle size checker for Next.js 16+ with Turbopack support (#654).
 *
 * Reads build artifacts to calculate first-load JS per route.
 * Works with both webpack and Turbopack builds.
 *
 * Per-route budgets (first-load JS, gzipped):
 *   - / (landing):      350 KB  (includes React Three Fiber)
 *   - /explore:         220 KB
 *   - /deposit:         200 KB
 *   - /withdraw:        200 KB
 *   - /portfolio:       200 KB
 *   - /project/[id]:    220 KB
 *   - Other routes:     180 KB default
 *
 * Framework bundle (shared):  ~150 KB gzipped
 *
 * These budgets reflect the current state with optimizations.
 * Update when making significant dependency or lazy-loading changes.
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// Per-route budgets in KB (gzipped)
const ROUTE_BUDGETS = {
  '/': 350, // Landing with React Three Fiber
  '/explore': 220,
  '/deposit': 200,
  '/withdraw': 200,
  '/portfolio': 200,
  '/project/[id]': 220,
  _default: 180, // All other routes
}

function getGzipSize(filePath) {
  try {
    const buffer = fs.readFileSync(filePath)
    return zlib.gzipSync(buffer).length
  } catch (err) {
    return 0
  }
}

function formatBytes(bytes) {
  return (bytes / 1024).toFixed(2)
}

function detectBuildType() {
  const nextDir = path.join(process.cwd(), '.next')
  const serverDir = path.join(nextDir, 'server')

  if (fs.existsSync(serverDir)) {
    const files = fs.readdirSync(serverDir)
    const hasTurbopackMarkers = files.some(
      (f) => f.includes('app-paths-manifest') || f.includes('middleware-build-manifest'),
    )
    const hasWebpackMarkers = files.some((f) => f.includes('webpack-'))

    if (hasTurbopackMarkers && !hasWebpackMarkers) return 'turbopack'
    if (hasWebpackMarkers) return 'webpack'
  }

  return 'unknown'
}

function getAllJsChunks(chunksDir) {
  const chunks = []

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkDir(fullPath)
      } else if (entry.name.endsWith('.js')) {
        chunks.push(fullPath)
      }
    }
  }

  walkDir(chunksDir)
  return chunks
}

function analyzeChunks(chunksDir) {
  const allChunks = getAllJsChunks(chunksDir)
  const frameworkChunks = []
  const appChunks = []

  for (const chunk of allChunks) {
    const name = path.basename(chunk)
    // Improved framework detection for both webpack and Turbopack
    const isFramework =
      name.includes('webpack') ||
      name.includes('main-app') ||
      name.includes('framework') ||
      name.includes('polyfill') ||
      name.includes('_app-') ||
      name.includes('_error-') ||
      name.match(/^\d+-[a-f0-9]+\.js$/) || // Turbopack framework chunks (e.g., 1-abc123.js)
      name.startsWith('main-')

    if (isFramework) {
      frameworkChunks.push(chunk)
    } else {
      appChunks.push(chunk)
    }
  }

  return { frameworkChunks, appChunks, allChunks }
}

function getRouteKey(route) {
  if (route === '' || route === 'index') return '/'
  if (route.startsWith('/')) return route
  return '/' + route
}

function getBudgetForRoute(route) {
  const key = getRouteKey(route)
  return ROUTE_BUDGETS[key] || ROUTE_BUDGETS._default
}

try {
  const nextDir = path.join(process.cwd(), '.next')
  const staticDir = path.join(nextDir, 'static', 'chunks')

  if (!fs.existsSync(nextDir)) {
    console.error('❌ Build output not found. Run `bun run build` first.')
    process.exit(1)
  }

  const buildType = detectBuildType()
  console.log(`\n📦 Bundle Size Report (${buildType})`)
  console.log('═'.repeat(70))

  const { frameworkChunks, appChunks, allChunks } = analyzeChunks(staticDir)

  let frameworkSize = 0
  for (const chunk of frameworkChunks) {
    frameworkSize += getGzipSize(chunk)
  }

  console.log(`\n  Framework chunks: ${formatBytes(frameworkSize)} KB gzipped`)
  console.log(
    `  Total chunks:     ${allChunks.length} (${frameworkChunks.length} framework + ${appChunks.length} app)`,
  )

  // Analyze app chunks
  const appSizes = appChunks.map((chunk) => ({
    name: path.relative(staticDir, chunk),
    size: getGzipSize(chunk),
  }))

  appSizes.sort((a, b) => b.size - a.size)

  console.log('\n  Top 5 application chunks:')
  for (const chunk of appSizes.slice(0, 5)) {
    console.log(`    ${formatBytes(chunk.size).padStart(8)} KB  ${chunk.name}`)
  }

  // Per-route analysis
  console.log('\n  Per-route first-load JS:')
  console.log('  ' + '─'.repeat(68))

  const commonRoutes = ['/', '/explore', '/deposit', '/withdraw', '/portfolio']
  const routes = []
  let failed = false

  for (const route of commonRoutes) {
    // Estimate route-specific chunks by name matching
    const routeChunks = appChunks.filter((c) => {
      const name = path.basename(c)
      const routePart = route === '/' ? 'page' : route.slice(1)
      return name.includes(routePart)
    })

    let routeSize = 0
    for (const chunk of routeChunks) {
      routeSize += getGzipSize(chunk)
    }

    const firstLoadSize = frameworkSize + routeSize
    const budget = getBudgetForRoute(route)
    const budgetBytes = budget * 1024

    const status = firstLoadSize <= budgetBytes ? '✅' : '❌'
    const diff = firstLoadSize - budgetBytes
    const diffStr =
      diff > 0 ? ` (+${formatBytes(diff)} KB)` : ` (-${formatBytes(-diff)} KB headroom)`

    routes.push({
      route,
      firstLoadSize,
      budget: budgetBytes,
      status,
    })

    console.log(
      `  ${status} ${route.padEnd(20)} ${formatBytes(firstLoadSize).padStart(8)} KB / ${budget} KB${diffStr}`,
    )

    if (firstLoadSize > budgetBytes) {
      failed = true
    }
  }

  console.log('  ' + '─'.repeat(68))

  const totalSize = frameworkSize + appChunks.reduce((sum, c) => sum + getGzipSize(c), 0)
  console.log(`\n  Total bundle size: ${formatBytes(totalSize)} KB gzipped`)

  console.log('═'.repeat(70))

  if (failed) {
    console.log('\n❌ FAILED: One or more routes exceed their budget.')
    console.log('\nTo fix:')
    console.log('  1. Check for duplicate dependencies in package.json')
    console.log('  2. Use dynamic imports for heavy components')
    console.log('  3. Analyze with: npx @next/bundle-analyzer')
    console.log('  4. Consider code splitting for large routes\n')
    process.exit(1)
  }

  const avgHeadroom =
    routes.reduce((sum, r) => sum + (r.budget - r.firstLoadSize), 0) / routes.length
  console.log(
    `\n✅ PASSED: All routes within budget (avg ${formatBytes(avgHeadroom)} KB headroom)\n`,
  )
  process.exit(0)
} catch (error) {
  console.error('❌ Error checking bundle size:', error.message)
  console.error(error.stack)
  process.exit(1)
}
