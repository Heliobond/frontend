/**
 * Doc-drift guard (#877). CONTRIBUTING.md listed only half of the coverage
 * thresholds enforced in CI, so PRs failed on modules the doc never mentioned.
 */
import { describe, it, expect } from '@/test/bun'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { coverageThresholds } from '../../scripts/test-coverage-config.mjs'

const ROOT = path.resolve(__dirname, '..', '..')

/** Keys whose backticked form does not appear in the document. */
function undocumentedKeys(doc: string, keys: string[]): string[] {
  return keys.filter((key) => !doc.includes(`\`${key}\``))
}

const doc = readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8')

describe('CONTRIBUTING coverage thresholds (#877)', () => {
  const keys = Object.keys(coverageThresholds).filter((key) => key.startsWith('src/'))

  it('finds the scoped thresholds', () => {
    expect(keys.length).toBeGreaterThan(0)
  })

  it('lists every scoped threshold in CONTRIBUTING', () => {
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
