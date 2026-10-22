#!/usr/bin/env node

/**
 * Supply-chain change gate (#915).
 *
 * A one-line edit to `"build"` in package.json or a hook file can run code
 * on every developer machine and in the deploy build. This script finds
 * changes to those files in a pull request, prints them as plain text (so
 * tab padding shows up as its length and content, not as a blank line), and
 * fails unless the PR carries the `supply-chain-reviewed` label. Only
 * maintainers can apply that label.
 *
 * Usage (from CI, with the base branch scripts):
 *   node scripts/check-supply-chain-changes.mjs <base-sha> <head-sha>
 * PR_LABELS is a JSON array of label names from the pull_request event.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const REVIEW_LABEL = 'supply-chain-reviewed'

/** Paths whose change can execute code, install packages or alter checks. */
const WATCHED_PATTERNS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^bun\.lock$/,
  /^bunfig\.toml$/,
  /^\.npmrc$/,
  /^\.husky\//,
  /^\.github\/(workflows|actions)\//,
  /^\.github\/(CODEOWNERS|dependabot\.ya?ml)$/,
  /^eslint\.config\.(c|m)?[jt]s$/,
  /^next\.config\.[jt]s$/,
  /^vitest\.(config|setup)\.[cm]?[jt]s$/,
  /^playwright[^/]*\.config\.[cm]?[jt]s$/,
  /^(postcss|tailwind)\.config\.[cm]?[jt]s$/,
  /^scripts\//,
]

/** package.json sections whose entries change what gets installed or run. */
const PACKAGE_SECTIONS = [
  'scripts',
  'dependencies',
  'devDependencies',
  'trustedDependencies',
  'overrides',
]

export const isWatched = (file) => WATCHED_PATTERNS.some((re) => re.test(file))

export const watchedFiles = (changedFiles) => changedFiles.filter(isWatched)

/**
 * True when the PR must wait for a maintainer to apply the review label.
 * A push (`synchronize`) ignores an existing label, so new commits are never
 * covered by an earlier review: the maintainer removes and re-applies it.
 */
export const requiresReview = (changedFiles, labels, action) =>
  watchedFiles(changedFiles).length > 0 &&
  (action === 'synchronize' || !labels.includes(REVIEW_LABEL))

/**
 * Compare two package.json texts section by section.
 * Missing or unparsable input is treated as an empty package.json.
 * @returns {{section: string, key: string, before?: unknown, after?: unknown}[]}
 */
export function packageJsonChanges(beforeText, afterText) {
  const parse = (text) => {
    try {
      return JSON.parse(text ?? '{}')
    } catch {
      return {}
    }
  }
  const before = parse(beforeText)
  const after = parse(afterText)
  const changes = []

  for (const section of PACKAGE_SECTIONS) {
    const a = before[section] ?? {}
    const b = after[section] ?? {}
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    for (const key of keys) {
      if (!(key in a)) changes.push({ section, key, after: b[key] })
      else if (!(key in b)) changes.push({ section, key, before: a[key] })
      else if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
        changes.push({ section, key, before: a[key], after: b[key] })
      }
    }
  }
  return changes
}

/**
 * Render one package.json change as a readable line.
 * @param {{section: string, key: string, before?: unknown, after?: unknown}} change
 */
export function formatChange({ section, key, before, after }) {
  const fmt = (v) => (v === undefined ? '(none)' : JSON.stringify(v))
  return `- ${section}.${key}: ${fmt(before)} -> ${fmt(after)}`
}

/** Keeps the job summary readable when a lockfile changes. */
export const MAX_DIFF_CHARS = 20000

export function truncateDiff(diff) {
  if (diff.length <= MAX_DIFF_CHARS) return diff
  const omitted = diff.length - MAX_DIFF_CHARS
  return `${diff.slice(0, MAX_DIFF_CHARS)}\n… ${omitted} more characters, see the "Files changed" tab`
}

/**
 * Build the markdown report written to the job summary.
 * @param {{file: string, diff: string}[]} fileDiffs raw `git diff` text per watched file
 * @param {ReturnType<typeof packageJsonChanges>} pkgChanges
 * @param {boolean} blocked
 */
export function buildReport(fileDiffs, pkgChanges, blocked) {
  const lines = ['## Supply-chain changes in this PR', '']
  if (fileDiffs.length === 0) {
    lines.push('No watched files changed.')
    return lines.join('\n')
  }
  lines.push(
    blocked
      ? `**Blocked:** a maintainer must review the changes below, then add the \`${REVIEW_LABEL}\` label (or remove and re-add it after a new push).`
      : `Label \`${REVIEW_LABEL}\` is present, so this check passes.`,
    '',
  )
  if (pkgChanges.length > 0) {
    lines.push('### package.json', '', ...pkgChanges.map(formatChange), '')
  }
  lines.push('### Raw diff (plain text, not the GitHub diff view)', '')
  for (const { file, diff } of fileDiffs) {
    lines.push(
      `#### ${file}`,
      '',
      '```diff',
      truncateDiff(diff.trimEnd()) || '(no textual changes)',
      '```',
      '',
    )
  }
  return lines.join('\n')
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function readAt(ref, file, cwd) {
  try {
    return git(['show', `${ref}:${file}`], cwd)
  } catch {
    return undefined
  }
}

function parseLabels(raw) {
  try {
    const parsed = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function main(argv, env) {
  const [base, head] = argv
  if (!base || !head) {
    console.error('usage: check-supply-chain-changes.mjs <base-sha> <head-sha>')
    process.exitCode = 2
    return
  }
  const cwd = process.cwd()
  const changed = git(['diff', '--name-only', `${base}...${head}`], cwd)
    .split('\n')
    .filter(Boolean)
  const watched = watchedFiles(changed)
  const labels = parseLabels(env.PR_LABELS)
  const blocked = requiresReview(changed, labels, env.PR_ACTION)

  const fileDiffs = watched.map((file) => ({
    file,
    diff: git(['diff', '--no-color', `${base}...${head}`, '--', file], cwd),
  }))
  const pkgChanges = watched.includes('package.json')
    ? packageJsonChanges(readAt(base, 'package.json', cwd), readAt(head, 'package.json', cwd))
    : []

  const report = buildReport(fileDiffs, pkgChanges, blocked)
  console.log(report)
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${report}\n`)
  if (blocked) {
    console.error(`\nsupply-chain check: add the "${REVIEW_LABEL}" label after review to continue.`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2), process.env)
}
