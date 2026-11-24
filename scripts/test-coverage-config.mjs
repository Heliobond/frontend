import { realpathSync } from 'node:fs'
import { matchesGlob, relative } from 'node:path'
import { createCoverageMap } from 'istanbul-lib-coverage'

export const coverageRoot = realpathSync(new URL('..', import.meta.url))
export const coverageSources = 'src/**/*.{ts,tsx}'

const exclusions = [
  '**/*.test.{ts,tsx}',
  'src/test/**',
  'src/data/**',
  'src/app/**/page.tsx',
  'src/brand/HelioWebGL.tsx',
]

export function isCoverageSource(filename) {
  return (
    matchesGlob(filename, coverageSources) &&
    !exclusions.some((pattern) => matchesGlob(filename, pattern))
  )
}

export const coverageThresholds = {
  global: { lines: 50, statements: 50, functions: 50, branches: 40 },
  'src/lib/api.ts': { lines: 80, statements: 80, functions: 80 },
  'src/wallet/vault.ts': { lines: 80, statements: 80, functions: 80 },
  'src/lib/webauthn.ts': { lines: 80, statements: 80, functions: 80 },
  'src/lib/yieldAlerts.ts': { lines: 80, statements: 80, functions: 80 },
  'src/lib/recurringInvestments.ts': { lines: 80, statements: 80, functions: 80 },
  'src/lib/scrollToError.ts': { lines: 80, statements: 80, functions: 80 },
  'src/lib/errorMessages.ts': { lines: 80, statements: 80, functions: 80 },
  'src/lib/**': { lines: 55 },
  'src/wallet/**': { lines: 55 },
  'src/session/**': { lines: 55 },
  'src/hooks/**': { lines: 55 },
  'src/alerts/**': { lines: 50 },
  'src/config/**': { lines: 55 },
  'src/wallet/registry.ts': { lines: 80 },
}

export function coverageFailures(coverageMap, thresholds = coverageThresholds) {
  const files = coverageMap.files()
  const failures = []
  for (const [scope, limits] of Object.entries(thresholds)) {
    const scoped = scope === 'global' ? coverageMap : createCoverageMap({})
    if (scope !== 'global') {
      for (const file of files) {
        if (matchesGlob(relative(coverageRoot, file), scope)) {
          scoped.addFileCoverage(coverageMap.fileCoverageFor(file))
        }
      }
    }
    const summary = scoped.getCoverageSummary()
    for (const [metric, minimum] of Object.entries(limits)) {
      const actual = summary[metric].pct
      if (typeof actual !== 'number' || actual < minimum) {
        failures.push(`${scope} ${metric}: ${actual}% is below the ${minimum}% minimum`)
      }
    }
  }
  return failures
}
