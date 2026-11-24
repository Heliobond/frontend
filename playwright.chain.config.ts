import { readFileSync, existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

/**
 * On-chain e2e journey (#607) against a local stellar/quickstart network.
 * Run scripts/e2e/setup-local-network.sh first; it writes the contract IDs and
 * the throwaway investor key to e2e/chain/.env.chain.local, loaded below.
 */
const ENV_FILE = process.env.E2E_CHAIN_ENV ?? 'e2e/chain/.env.chain.local'

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  const env: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) env[match[1]] = match[2]
  }
  return env
}

const chainEnv = loadEnv(ENV_FILE)
const effectiveEnv = Object.fromEntries(
  Object.entries(chainEnv).map(([key, value]) => [key, process.env[key] ?? value]),
)
Object.assign(process.env, effectiveEnv)

const PORT = Number(process.env.E2E_CHAIN_PORT ?? 3100)

export default defineConfig({
  testDir: './e2e/chain',
  // Each step waits on ledger closes; the whole journey is one long test.
  timeout: 5 * 60_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  outputDir: 'test-results/chain',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/chain', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A production build, so NEXT_PUBLIC_* values are inlined as they would be in a deploy.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 10 * 60_000,
    env: effectiveEnv,
  },
})
