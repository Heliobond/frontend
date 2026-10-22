#!/usr/bin/env node

/**
 * Hidden-payload check (#914).
 *
 * GitHub's diff view renders a line that starts with hundreds of tabs as an
 * apparently blank line, which is how the Heliobond/backend#969 payload got
 * past review (see #912). This script flags the mechanical signatures of that
 * technique across every tracked text file:
 *
 *   1. Lines over MAX_LINE_LENGTH in source, scripts, hooks and root scripts.
 *   2. Runs of 8+ tabs, or 40+ spaces before code, anywhere in a line.
 *   3. Zero-width and bidi-control characters (Trojan Source, CVE-2021-42574).
 *   4. Dynamic-code and escape-obfuscation primitives in non-test source.
 *   5. New root-level scripts that are not on ROOT_SCRIPT_ALLOWLIST.
 *
 * Exits 1 and prints each finding with a visible (escaped) preview of the line.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const MAX_LINE_LENGTH = 400

/** Root-level JS/TS files that are allowed to exist. Adding one needs review (#915). */
export const ROOT_SCRIPT_ALLOWLIST = new Set([
  'eslint.config.mjs',
  'next.config.ts',
  'playwright.chain.config.ts',
  'playwright.config.ts',
  'vitest.setup.ts',
])

const LOCKFILES = new Set(['bun.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])
const SOURCE_DIRS = ['src/', 'scripts/', '.husky/', 'e2e/', '.github/']
const ROOT_SCRIPT_RE = /\.(js|mjs|cjs|ts)$/
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/

const BIDI_AND_ZERO_WIDTH_RE = /[\u200B-\u200D]|[\u2060\uFEFF]|[\u202A-\u202E]|[\u2066-\u2069]/
const PADDING_RE = /\t{8,}|[ ]{40,}\S/
const BOM = '\uFEFF'
// Written with escapes so this file does not match its own rules.
const DYNAMIC_CODE_RES = [
  /\bFunction\(/,
  /\beval\(/,
  /\batob\(/,
  /fromChar[C]ode/,
  // Four or more escapes in a row is the obfuscated-identifier shape from #912.
  // Single escapes are normal in regex character classes.
  /(?:\\u[0-9a-fA-F]{4}){4,}/,
  /(?:\\x[0-9a-fA-F]{2}){4,}/,
  // javascript-obfuscator's generated identifiers, e.g. _0x followed by hex.
  /\b_0x[0-9a-f]{4,}\b/,
]

/**
 * Reviewed exceptions for legitimate code that trips a rule. Each entry only
 * covers lines containing `includes` in `file`, so any edit to those lines is
 * checked again. Keep this list short; #915 flags changes to this file.
 */
export const LINE_ALLOWLIST = [
  { file: 'src/lib/webauthn.ts', rule: 'dynamic-code', includes: 'at\u006Fb(' },
  { file: 'src/lib/webauthn.ts', rule: 'dynamic-code', includes: 'fromChar\u0043ode(' },
  { file: 'src/lib/securityHeaders.ts', rule: 'dynamic-code', includes: 'fromChar\u0043ode(' },
  { file: 'src/session/sessionClient.ts', rule: 'dynamic-code', includes: 'at\u006Fb(' },
  { file: 'src/shell/TopBar.tsx', rule: 'long-line', includes: 'M19.4 15a1.7 1.7 0 0 0 .3 1.9' },
  {
    file: 'src/session/challengeGuard.ts',
    rule: 'dynamic-code',
    includes: '\\u0008\\u000b\\u000c',
  },
]

const isAllowed = (file, rule, content) =>
  LINE_ALLOWLIST.some((a) => a.file === file && a.rule === rule && content.includes(a.includes))

const isRootFile = (p) => !p.includes('/')
const isRootScript = (p) => isRootFile(p) && ROOT_SCRIPT_RE.test(p)
const isSourceScope = (p) => SOURCE_DIRS.some((d) => p.startsWith(d)) || isRootScript(p)
const isTestFile = (p) => TEST_RE.test(p)

/** Whether a tracked path is scanned at all. */
export function isScannedPath(p) {
  if (LOCKFILES.has(p)) return false
  if (p.startsWith('messages/') || p.startsWith('public/')) return false
  if (p.endsWith('.md')) return false
  return true
}

/** Show a line with tabs and other control characters made visible. */
function preview(line) {
  return JSON.stringify(line.slice(0, 120)) + (line.length > 120 ? '…' : '')
}

/**
 * Scan one file's text and return findings.
 * @param {string} filePath repo-relative path
 * @param {string} text file contents
 * @returns {{file: string, line: number, rule: string, message: string, preview: string}[]}
 */
export function scanText(filePath, rawText) {
  const findings = []
  const add = (line, rule, message, content) => {
    if (isAllowed(filePath, rule, content)) return
    findings.push({ file: filePath, line, rule, message, preview: preview(content) })
  }

  // A byte-order mark at the very start of a file is harmless; one anywhere else is not.
  const text = rawText.startsWith(BOM) ? rawText.slice(1) : rawText
  const lines = text.split('\n')
  const checkLength = isSourceScope(filePath)
  const checkDynamic = isSourceScope(filePath) && !isTestFile(filePath)

  lines.forEach((content, index) => {
    const lineNo = index + 1
    if (checkLength && content.length > MAX_LINE_LENGTH) {
      add(lineNo, 'long-line', `line is ${content.length} chars (max ${MAX_LINE_LENGTH})`, content)
    }
    if (PADDING_RE.test(content)) {
      add(lineNo, 'padding', 'run of 8+ tabs or 40+ spaces before code', content)
    }
    if (BIDI_AND_ZERO_WIDTH_RE.test(content)) {
      add(lineNo, 'hidden-char', 'zero-width or bidi control character', content)
    }
    if (checkDynamic) {
      const hit = DYNAMIC_CODE_RES.find((re) => re.test(content))
      if (hit) add(lineNo, 'dynamic-code', `matches ${hit.source}`, content)
    }
  })

  return findings
}

/**
 * Check which root-level scripts are not on the allowlist.
 * @param {string[]} paths all tracked repo-relative paths
 */
export function scanRootScripts(paths) {
  return paths
    .filter((p) => isRootScript(p) && !ROOT_SCRIPT_ALLOWLIST.has(p))
    .map((p) => ({
      file: p,
      line: 0,
      rule: 'root-script',
      message:
        'new root-level script is not on ROOT_SCRIPT_ALLOWLIST (scripts/check-hidden-content.mjs)',
      preview: '',
    }))
}

/**
 * Scan tracked files. Binary files (containing NUL) are skipped.
 * @param {{path: string, text: string}[]} files
 */
export function scanFiles(files) {
  const findings = scanRootScripts(files.map((f) => f.path))
  for (const { path: p, text } of files) {
    if (!isScannedPath(p) || text.includes('\0')) continue
    findings.push(...scanText(p, text))
  }
  return findings
}

function listTrackedFiles(cwd) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' })
  return out.split('\0').filter(Boolean)
}

function main() {
  const cwd = process.cwd()
  const paths = listTrackedFiles(cwd)
  const files = paths.map((p) => ({
    path: p,
    text:
      isScannedPath(p) && fs.existsSync(path.join(cwd, p))
        ? fs.readFileSync(path.join(cwd, p), 'utf8')
        : '',
  }))
  const findings = scanFiles(files)

  if (findings.length === 0) {
    console.log(
      `hidden-content check: ${files.filter((f) => f.text).length} files scanned, no findings`,
    )
    return
  }

  console.error(`hidden-content check: ${findings.length} finding(s)\n`)
  for (const f of findings) {
    const where = f.line ? `${f.file}:${f.line}` : f.file
    console.error(`  [${f.rule}] ${where}: ${f.message}`)
    if (f.preview) console.error(`      ${f.preview}`)
  }
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
}
