import { describe, expect, it } from 'vitest'
import {
  MAX_LINE_LENGTH,
  isScannedPath,
  scanFiles,
  scanRootScripts,
  scanText,
} from './check-hidden-content.mjs'

const TABS = '\t'.repeat(300)
const rules = (findings: { rule: string }[]) => findings.map((f) => f.rule)

describe('isScannedPath', () => {
  it('skips lockfiles, messages, public assets and markdown', () => {
    expect(isScannedPath('bun.lock')).toBe(false)
    expect(isScannedPath('package-lock.json')).toBe(false)
    expect(isScannedPath('messages/en.json')).toBe(false)
    expect(isScannedPath('public/icon.svg')).toBe(false)
    expect(isScannedPath('docs/AUTH.md')).toBe(false)
  })

  it('scans source, config and hooks', () => {
    expect(isScannedPath('src/lib/api.ts')).toBe(true)
    expect(isScannedPath('next.config.ts')).toBe(true)
    expect(isScannedPath('.husky/pre-commit')).toBe(true)
  })
})

describe('scanText: long lines', () => {
  it('flags a line over the limit in source', () => {
    const findings = scanText('src/a.ts', 'x'.repeat(MAX_LINE_LENGTH + 1))
    expect(rules(findings)).toEqual(['long-line'])
    expect(findings[0].line).toBe(1)
  })

  it('accepts a line exactly at the limit', () => {
    expect(scanText('src/a.ts', 'x'.repeat(MAX_LINE_LENGTH))).toEqual([])
  })

  it('does not apply the length rule outside source directories', () => {
    expect(scanText('docs/notes.txt', 'x'.repeat(MAX_LINE_LENGTH + 50))).toEqual([])
  })
})

describe('scanText: padding', () => {
  it('flags a run of 8+ tabs, including the tab-padded payload shape', () => {
    expect(rules(scanText('src/a.ts', `${TABS}console.log(1)`))).toContain('padding')
    expect(rules(scanText('src/a.ts', `const a = 1;${'\t'.repeat(8)}// hidden`))).toContain(
      'padding',
    )
  })

  it('flags 40+ spaces before code', () => {
    expect(rules(scanText('src/a.ts', `${' '.repeat(40)}code()`))).toContain('padding')
  })

  it('accepts normal indentation', () => {
    expect(scanText('src/a.ts', '    if (x) {\n\t\treturn 1\n    }')).toEqual([])
  })
})

describe('scanText: hidden characters', () => {
  it('flags zero-width and bidi control characters', () => {
    expect(rules(scanText('src/a.ts', 'const a\u200B = 1'))).toEqual(['hidden-char'])
    expect(rules(scanText('src/a.ts', 'if (isAdmin) { // \u202Eedoc'))).toEqual(['hidden-char'])
  })

  it('allows a byte-order mark only at the start of the file', () => {
    expect(scanText('src/a.ts', "\uFEFF'use client'")).toEqual([])
    expect(rules(scanText('src/a.ts', "'use client'\n\uFEFFconst a = 1"))).toEqual(['hidden-char'])
  })
})

describe('scanText: dynamic code and escape obfuscation', () => {
  it('flags eval, Function, atob and fromCharCode in non-test source', () => {
    expect(rules(scanText('src/a.ts', 'eval(payload)'))).toEqual(['dynamic-code'])
    expect(rules(scanText('src/a.ts', 'new Function(body)'))).toEqual(['dynamic-code'])
    expect(rules(scanText('src/a.ts', 'atob(x)'))).toEqual(['dynamic-code'])
    expect(rules(scanText('scripts/run.mjs', 'String.fromCharCode(1)'))).toEqual(['dynamic-code'])
  })

  it('flags four or more consecutive \\u escapes (obfuscated identifiers)', () => {
    const payload = 'const o = {\\u0063\\u0068\\u0069\\u006c\\u0064: 1}'
    expect(rules(scanText('src/a.ts', payload))).toEqual(['dynamic-code'])
  })

  it('flags \\x escape runs and obfuscator identifiers', () => {
    expect(scanText('src/a.ts', "const s = '" + '\\x63\\x68\\x61\\x72' + "'")[0].rule).toBe(
      'dynamic-code',
    )
    expect(scanText('src/a.ts', 'var _0x' + '4c42d = 1')[0].rule).toBe('dynamic-code')
  })

  it('scans e2e helpers and workflows as source', () => {
    expect(scanText('e2e/wallet-fixtures.ts', 'x'.repeat(401))[0].rule).toBe('long-line')
    expect(scanText('.github/workflows/ci.yml', 'run: e' + 'val("x")')[0].rule).toBe('dynamic-code')
  })

  it('accepts single escapes inside regex character classes', () => {
    expect(scanText('src/a.ts', '/[\\u0000-\\u001f]/.test(s)')).toEqual([])
  })

  it('does not apply dynamic-code rules to test files or non-source paths', () => {
    expect(scanText('src/a.test.ts', 'eval(x)')).toEqual([])
    expect(scanText('docs/x.txt', 'eval(x)')).toEqual([])
  })
})

describe('scanRootScripts', () => {
  it('flags a root-level script that is not on the allowlist', () => {
    const findings = scanRootScripts(['api.js', 'next.config.ts', 'src/api.js'])
    expect(findings.map((f) => f.file)).toEqual(['api.js'])
    expect(findings[0].rule).toBe('root-script')
  })

  it('ignores root files that are not scripts', () => {
    expect(scanRootScripts(['README.md', 'bun.lock'])).toEqual([])
  })
})

describe('scanFiles', () => {
  it('combines root-script and content findings and skips unscanned files', () => {
    const findings = scanFiles([
      { path: 'api.js', text: '' },
      { path: 'src/a.ts', text: `${TABS}x` },
      { path: 'messages/en.json', text: TABS },
    ])
    expect(rules(findings).sort()).toEqual(['padding', 'root-script'])
  })

  it('skips binary files that contain NUL bytes', () => {
    expect(scanFiles([{ path: 'src/logo.bin', text: `\0${TABS}` }])).toEqual([])
  })
})

describe('current repository', () => {
  it('passes the hidden-content check on the checked-out tree', async () => {
    const { execFileSync } = await import('node:child_process')
    const fs = await import('node:fs')
    const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
    const files = paths.map((p) => ({
      path: p,
      text: isScannedPath(p) && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '',
    }))
    expect(scanFiles(files)).toEqual([])
  })
})
