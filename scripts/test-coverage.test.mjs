import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createCoverageMap } from 'istanbul-lib-coverage'
import { createInstrumenter } from 'istanbul-lib-instrument'
import { coverageFailures, coverageRoot, isCoverageSource } from './test-coverage-config.mjs'

test('instruments source and keeps the existing coverage exclusions', () => {
  expect(isCoverageSource('src/lib/api.ts')).toBe(true)
  expect(isCoverageSource('src/app/api/example/route.ts')).toBe(true)
  for (const filename of [
    'src/lib/api.test.ts',
    'src/test/mock.ts',
    'src/data/example.ts',
    'src/app/page.tsx',
    'src/app/example/page.tsx',
    'src/brand/HelioWebGL.tsx',
    'scripts/check.ts',
  ]) {
    expect(isCoverageSource(filename)).toBe(false)
  }
})

test('gates on missed statements and branches even when the containing line runs', () => {
  const path = join(coverageRoot, 'src/lib/api.ts')
  const instrumenter = createInstrumenter({
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
  })
  const source = instrumenter.instrumentSync('if (true) { 1; } else { 2; }', path)
  const realm = {}
  runInNewContext(source, realm)
  const map = createCoverageMap(realm.__coverage__)

  expect(map.getCoverageSummary().lines.pct).toBe(100)
  expect(
    coverageFailures(map, { global: { branches: 80 }, 'src/lib/api.ts': { statements: 80 } }),
  ).toEqual([
    'global branches: 50% is below the 80% minimum',
    'src/lib/api.ts statements: 66.66% is below the 80% minimum',
  ])
})
