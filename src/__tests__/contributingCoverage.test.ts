/**
 * Doc-drift guard (#877). CONTRIBUTING.md listed only half of the coverage
 * thresholds enforced by vitest.config.mts, so PRs failed on modules the doc never
 * mentioned. Every threshold key in the config must be named in the doc.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

/** Threshold keys are the quoted `src/...` entries inside the `thresholds` block. */
function thresholdKeys(config: string): string[] {
  const keys = [...config.matchAll(/^\s*'(src\/[^']+)':/gm)].map((match) => match[1])
  return [...new Set(keys)]
}

/** Keys whose backticked form does not appear in the document. */
function undocumentedKeys(doc: string, keys: string[]): string[] {
  return keys.filter((key) => !doc.includes(`\`${key}\``))
}

const config = readFileSync(path.join(ROOT, 'vitest.config.mts'), 'utf8')
const doc = readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8')

describe('CONTRIBUTING coverage thresholds (#877)', () => {
  const keys = thresholdKeys(config)

  it('finds the threshold keys in vitest.config.mts', () => {
    expect(keys.length).toBeGreaterThan(0)
  })

  it('lists every threshold key from vitest.config.mts', () => {
    expect(undocumentedKeys(doc, keys)).toEqual([])
  })

  it('no longer claims only src/lib and src/wallet are instrumented', () => {
    expect(doc).not.toContain('Only `src/lib/**` and `src/wallet/**` are instrumented')
  })

  it('fails when a threshold key is missing from the doc', () => {
    const [removed] = keys
    const stale = doc.replaceAll(`\`${removed}\``, '')
    expect(undocumentedKeys(stale, keys)).toEqual([removed])
  })
})
