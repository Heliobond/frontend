import { afterAll } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { coverageRoot, coverageSources } from './test-coverage-config.mjs'

const runDir = process.env.BUN_TEST_COVERAGE_DIR
const sourceDir = join(runDir, 'source')
const instrumented = [...new Bun.Glob(coverageSources).scanSync({ cwd: sourceDir })]
const filter = new RegExp(
  `^${RegExp.escape(coverageRoot)}/(?:${instrumented.map((file) => RegExp.escape(file)).join('|')})$`,
)

Bun.plugin({
  name: 'istanbul-coverage',
  setup(build) {
    build.onLoad({ filter }, ({ path }) => ({
      contents: readFileSync(join(sourceDir, relative(coverageRoot, path)), 'utf8'),
      loader: path.endsWith('.tsx') ? 'tsx' : 'ts',
    }))
  },
})

// Bun runs preload afterAll hooks once per isolated file, after its own hooks.
afterAll(() => {
  if (globalThis.__coverage__) {
    writeFileSync(
      join(runDir, 'hits', `${randomUUID()}.json`),
      JSON.stringify(globalThis.__coverage__),
    )
  }
})
