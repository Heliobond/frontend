import { describe, expect, it } from '@/test/bun'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../playwright.config.ts'

const posix = (p) => p.replace(/\\/g, '/')
const e2eDir = posix(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../e2e'))

// Minimal stand-in for Playwright's testMatch / testIgnore: RegExp or glob.
function matchesAny(patterns, file) {
  if (patterns === undefined) return false
  return [].concat(patterns).some((pattern) => {
    if (pattern instanceof RegExp) return pattern.test(file)
    const source = String(pattern)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '(?:.*/)?')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
    return new RegExp(`^${source}$`).test(file)
  })
}

function selectedBy(project, file) {
  const included =
    project.testMatch === undefined ? /\.spec\.ts$/.test(file) : matchesAny(project.testMatch, file)
  const ignored =
    matchesAny(project.testIgnore, file) ||
    matchesAny(config.testIgnore, file.slice(e2eDir.length + 1))
  return included && !ignored
}

const specs = fs
  .readdirSync(e2eDir)
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => `${e2eDir}/${name}`)

describe('playwright projects (#1039)', () => {
  const projects = config.projects ?? []

  it('finds the e2e specs', () => {
    expect(specs.length).toBeGreaterThan(0)
  })

  it('selects each browser journey in exactly one project', () => {
    for (const file of specs) {
      const owners = projects.filter((project) => selectedBy(project, file)).map((p) => p.name)
      expect(owners, path.basename(file)).toHaveLength(1)
    }
  })

  it('keeps the general journeys in chromium', () => {
    const chromium = projects.find((p) => p.name === 'chromium')
    for (const name of ['connect', 'deposit', 'withdraw', 'watchlist', 'a11y']) {
      expect(selectedBy(chromium, `${e2eDir}/${name}.spec.ts`), name).toBe(true)
    }
  })

  it('runs the dedicated security-header checks only in the production project', () => {
    const owners = projects
      .filter((p) => selectedBy(p, `${e2eDir}/security-headers.spec.ts`))
      .map((p) => p.name)
    expect(owners).toEqual(['production'])
  })

  it('does not pull the on-chain journey into either project', () => {
    const chain = `${e2eDir}/chain/investor-journey.spec.ts`
    expect(projects.some((p) => selectedBy(p, chain))).toBe(false)
  })

  it('keeps the dedicated production command on the production project and header spec', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(e2eDir, '../package.json'), 'utf8'))
    const script = pkg.scripts['test:e2e:production']
    expect(script).toContain('CSP_MODE=enforce')
    expect(script).toContain('E2E_PRODUCTION=true')
    expect(script).toContain('--project=production')
    expect(script).toContain('e2e/security-headers.spec.ts')
  })
})
