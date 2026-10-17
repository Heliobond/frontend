import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, it, expect } from 'vitest'

const REPO_ROOT = resolve(__dirname, '../../..')
const ENV_EXAMPLE_PATH = join(REPO_ROOT, '.env.example')
const SRC_DIR = join(REPO_ROOT, 'src')

// Standard runtime/platform variables injected by Node or hosting providers
const ALLOWLISTED_PLATFORM_VARS = new Set([
  'NODE_ENV',
  'VERCEL_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
])

function parseEnvExampleKeys(content: string): string[] {
  const keys: string[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = /^([A-Z0-9_]+)=/.exec(trimmed)
    if (match) {
      keys.push(match[1])
    }
  }
  return keys
}

function findProcessEnvVars(dir: string): Set<string> {
  const vars = new Set<string>()

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir)
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
        const fileContent = readFileSync(fullPath, 'utf8')
        const regex = /process\.env\.([A-Z0-9_]+)/g
        let match: RegExpExecArray | null
        while ((match = regex.exec(fileContent)) !== null) {
          vars.add(match[1])
        }
      }
    }
  }

  walk(dir)
  return vars
}

describe('.env.example regression suite', () => {
  it('does not contain any duplicate environment variable keys', () => {
    const content = readFileSync(ENV_EXAMPLE_PATH, 'utf8')
    const keys = parseEnvExampleKeys(content)
    const seen = new Set<string>()
    const duplicates: string[] = []

    for (const key of keys) {
      if (seen.has(key)) {
        duplicates.push(key)
      }
      seen.add(key)
    }

    expect(duplicates).toEqual([])
    expect(keys.length).toBe(seen.size)
  })

  it('documents all required E2E variables in a dedicated section', () => {
    const content = readFileSync(ENV_EXAMPLE_PATH, 'utf8')
    const keys = new Set(parseEnvExampleKeys(content))

    const requiredE2EVars = [
      'NEXT_PUBLIC_E2E_TEST_WALLET',
      'E2E_CHAIN_ENV',
      'E2E_CHAIN_PORT',
      'E2E_PRODUCTION',
      'E2E_PRODUCTION_SERVER',
    ]

    for (const e2eVar of requiredE2EVars) {
      expect(keys.has(e2eVar), `Missing expected E2E variable ${e2eVar}`).toBe(true)
    }
  })

  it('documents every process.env variable read in src/', () => {
    const content = readFileSync(ENV_EXAMPLE_PATH, 'utf8')
    const documentedKeys = new Set(parseEnvExampleKeys(content))
    const codeVars = findProcessEnvVars(SRC_DIR)

    const missingFromExample: string[] = []
    for (const v of codeVars) {
      if (!ALLOWLISTED_PLATFORM_VARS.has(v) && !documentedKeys.has(v)) {
        missingFromExample.push(v)
      }
    }

    expect(missingFromExample).toEqual([])
  })
})
