import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createCoverageMap } from 'istanbul-lib-coverage'
import { createInstrumenter } from 'istanbul-lib-instrument'
import { createContext } from 'istanbul-lib-report'
import reports from 'istanbul-reports'
import {
  coverageFailures,
  coverageRoot,
  coverageSources,
  isCoverageSource,
} from './test-coverage-config.mjs'

const runDir = mkdtempSync(join(tmpdir(), 'heliobond-coverage-'))
const hitsDir = join(runDir, 'hits')

try {
  mkdirSync(hitsDir)
  const coverageMap = createCoverageMap({})
  const sources = new Bun.Glob(coverageSources).scanSync({ cwd: coverageRoot })
  for (const filename of sources) {
    if (!isCoverageSource(filename)) continue
    const path = join(coverageRoot, filename)
    const instrumenter = createInstrumenter({
      esModules: true,
      parserPlugins: filename.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
      coverageGlobalScope: 'globalThis',
      coverageGlobalScopeFunc: false,
      preserveComments: true,
      // Keep test failure excerpts on their original source lines.
      compact: false,
      generatorOpts: { retainLines: true },
    })
    const contents = instrumenter.instrumentSync(readFileSync(path, 'utf8'), path)
    const output = join(runDir, 'source', filename)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, contents)

    // Include zero counters for source files the suite never imports.
    const coverage = instrumenter.lastFileCoverage()
    if (coverage) coverageMap.addFileCoverage(coverage)
  }

  const run = Bun.spawn(
    [process.execPath, 'run', 'test', '--preload', './scripts/test-coverage-preload.mjs'],
    {
      cwd: coverageRoot,
      env: { ...process.env, BUN_TEST_COVERAGE_DIR: runDir },
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    },
  )
  process.exitCode = await run.exited

  if (process.exitCode === 0) {
    const hits = readdirSync(hitsDir)
    if (hits.length === 0) throw new Error('Bun did not produce any coverage counters')
    for (const file of hits) {
      coverageMap.merge(JSON.parse(readFileSync(join(hitsDir, file), 'utf8')))
    }

    const context = createContext({ dir: join(coverageRoot, 'coverage'), coverageMap })
    for (const format of ['text', 'json', 'json-summary', 'html'])
      reports.create(format).execute(context)
    for (const failure of coverageFailures(coverageMap)) {
      console.error(`Coverage threshold failed: ${failure}`)
      process.exitCode = 1
    }
  }
} finally {
  rmSync(runDir, { recursive: true, force: true })
}
