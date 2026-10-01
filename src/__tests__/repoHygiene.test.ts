/**
 * Repo-hygiene guard (#653). Editor swap files and one-off PR write-ups used to be
 * committed at the root; they clutter the tree and show up in Prettier and search
 * results. This test fails the build if they come back.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { DEV_ROUTES } from '../lib/devRoutes'
import { ROUTES } from '../lib/routeMetadata'

const ROOT = path.resolve(__dirname, '..', '..')
const SWAP = /\.(swp|swo|swn)$/

/** Only the top level plus one level of dirs — swap files never live deeper. */
function walk(dir: string, depth = 1): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next') return []
    const full = path.join(dir, entry)
    if (!statSync(full).isDirectory()) return [full]
    return depth > 0 ? walk(full, depth - 1) : []
  })
}

const tracked = walk(ROOT).map((file) => path.relative(ROOT, file))

describe('repo hygiene (#653)', () => {
  it('has no committed editor swap/backup files', () => {
    expect(tracked.filter((file) => SWAP.test(file))).toEqual([])
  })

  it('ignores swap/backup patterns in .gitignore', () => {
    const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
    for (const pattern of ['*.swp', '*.swo', '*~']) expect(gitignore).toContain(pattern)
  })

  it('has no leftover single-PR write-ups at the root', () => {
    const leftovers = [
      'PR_DESCRIPTION.md',
      'pr-description.md',
      'IMPLEMENTATION_SUMMARY.md',
    ].filter((name) => existsSync(path.join(ROOT, name)))
    expect(leftovers).toEqual([])
  })

  it('does not track .vscode/ settings that .gitignore also lists', () => {
    const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.vscode/')
    expect(gitignore).not.toContain('!.vscode/settings.json')
  })
})

/**
 * The README drifted from the code more than once (#659): a stale locale list, a
 * stale route list, and a claim that the vault was simulated when it builds and
 * submits real transactions. These checks fail when the docs go stale again.
 */
describe('README accuracy (#659)', () => {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')

  it('lists every locale in the message catalog', () => {
    for (const file of readdirSync(path.join(ROOT, 'messages'))) {
      expect(readme).toContain(file)
    }
  })

  it('does not state a message key count that can go stale', () => {
    expect(readme).not.toMatch(/\b\d{2,}\s+keys\b/i)
  })

  it('lists every route segment that src/app renders', () => {
    const routes = [
      ...ROUTES.map((r) => r.path),
      '/project/[id]', // resolves its own metadata per record
      ...DEV_ROUTES,
    ]
    for (const route of routes) {
      if (route === '/') continue // the README calls it "the landing hero"
      expect(readme).toContain(route)
    }
  })

  it('no longer claims the on-chain calls are the unshipped work', () => {
    // The stale wording called the vault client simulated and listed "real
    // on-chain calls" as future work. Both have shipped; a fallback being
    // described as a fallback is fine.
    expect(readme).not.toMatch(/vault client is simulated/i)
    expect(readme).not.toMatch(/real on-chain calls/i)
    expect(readme).toMatch(/builds, signs and submits real Soroban transactions/i)
  })

  it('separates what is on-chain, env-var dependent and fixture data', () => {
    expect(readme).toContain('## What runs where')
    expect(readme).toMatch(/on-chain when the contract ID is set/i)
    expect(readme).toMatch(/fixture/i)
  })
})

/**
 * CONTRIBUTING.md and the PR template drifted from the repo too (#725): they
 * described an opt-in Husky hook that actually installs itself, CI jobs that
 * don't exist, two locales instead of five, and none of the test:coverage /
 * test:e2e:* commands. These checks fail when the docs go stale again.
 */
describe('contributor docs accuracy (#725)', () => {
  const contributing = readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8')
  const prTemplate = readFileSync(path.join(ROOT, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8')
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const preCommit = readFileSync(path.join(ROOT, '.husky/pre-commit'), 'utf8')
  const ci = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')

  it('lists every shipped locale catalog', () => {
    for (const file of readdirSync(path.join(ROOT, 'messages'))) {
      expect(contributing).toContain(file)
      expect(prTemplate).toContain(file)
    }
  })

  it('no longer tells contributors to update only en and fr', () => {
    for (const doc of [contributing, prTemplate]) {
      expect(doc).not.toMatch(/\bboth\b[^.\n]*en\.json/i)
      expect(doc).not.toMatch(/\bboth\b[^.\n]*fr\.json/i)
    }
  })

  it('names the CI jobs that exist and does not claim CI lints', () => {
    for (const job of ['build', 'unit tests + coverage']) {
      expect(contributing).toContain(job)
      expect(ci).toContain(job)
    }
    expect(contributing).toMatch(/no CI job for\s*\n?\s*lint/i)
    expect(contributing).not.toMatch(/CI runs build, typecheck, lint/i)
  })

  it('describes the hook that is actually installed', () => {
    // .husky/pre-commit runs lint-staged and typecheck — no tests.
    expect(preCommit).toContain('lint-staged')
    expect(preCommit).toContain('typecheck')
    expect(preCommit).not.toContain('run test')

    expect(contributing).toContain('bunx lint-staged')
    expect(contributing).toContain('HUSKY=0')
    expect(contributing).toContain('--no-verify')
    expect(contributing).toMatch(/already active/i)
    // The stale version claimed the hook runs the full suite and needs opt-in.
    expect(contributing).not.toMatch(/full test suite on every commit/i)
    expect(contributing).not.toMatch(/not\*\* installed unless you run/i)
  })

  it('documents every test command that exists', () => {
    for (const script of ['test:coverage', 'test:e2e:production', 'test:e2e:chain']) {
      expect(pkg.scripts[script]).toBeDefined()
      expect(contributing).toContain(`bun run ${script}`)
    }
  })

  it('references only bun scripts that exist', () => {
    const referenced = [...contributing.matchAll(/bun run ([a-z][a-z0-9:]*)/g)].map((m) => m[1])
    expect(referenced.length).toBeGreaterThan(5)
    for (const script of new Set(referenced)) {
      expect(Object.keys(pkg.scripts)).toContain(script)
    }
  })
})
