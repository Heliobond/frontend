import { describe, expect, it } from '@/test/bun'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-type-coverage.mjs')

/** Run the checker against a throwaway src tree. */
function runChecker(sources) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'type-coverage-'))
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    for (const [name, content] of Object.entries(sources)) {
      fs.writeFileSync(path.join(root, 'src', name), content)
    }
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf-8' })
    return { status: result.status, output: `${result.stdout}${result.stderr}` }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe('check-type-coverage syntax-node detection', () => {
  it('fails on a quoted property whose type is any', () => {
    const { status, output } = runChecker({
      'quoted.ts': `export interface Caption {\n  "label": any\n}\n`,
    })
    expect(status).toBe(1)
    expect(output).toContain('quoted.ts:2')
  })

  it('fails on a real any annotation', () => {
    const { status } = runChecker({ 'real.ts': `export const value: any = 1\n` })
    expect(status).toBe(1)
  })

  it('ignores the word any in strings and comments', () => {
    const { status, output } = runChecker({
      'prose.ts': `// before any money moves\nexport const text = 'any string content'\n`,
    })
    expect(status).toBe(0)
    expect(output).toContain('No `any` types found')
  })
})
