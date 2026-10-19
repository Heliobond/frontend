import { defineConfig, devices } from '@playwright/test'

const isProductionCSP =
  process.env.E2E_PRODUCTION === 'true' ||
  process.env.CSP_MODE === 'enforce' ||
  process.argv.includes('--project=production') ||
  process.env.npm_lifecycle_event === 'test:e2e:production'

/**
 * CI runs the specs against a production build (`next start`) instead of the dev
 * server, so the suite exercises what actually ships (#596). The build is run by
 * the e2e job beforehand; this only selects the server command and port.
 */
const useProductionServer = process.env.E2E_PRODUCTION_SERVER === 'true'

const productionPort = Number(process.env.E2E_PRODUCTION_PORT) || 3200
const port = isProductionCSP ? productionPort : useProductionServer ? 3001 : 3000
const baseURL = `http://localhost:${port}`
const runner =
  process.env.npm_execpath && process.env.npm_execpath.includes('bun') ? 'bun run' : 'npm run'

export default defineConfig({
  testDir: './e2e',
  // The on-chain journey needs a local network; see playwright.chain.config.ts.
  testIgnore: ['chain/**'],
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'production',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: isProductionCSP
    ? {
        command: `NEXT_PUBLIC_API_URL=https://api.example.test PORT=${productionPort} CSP_MODE=enforce ${runner} build && NEXT_PUBLIC_API_URL=https://api.example.test PORT=${productionPort} CSP_MODE=enforce ${runner} start`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : useProductionServer
      ? {
          // The caller has already built; only start the server here.
          command: `PORT=3001 ${runner} start`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        }
      : {
          command: `${runner} dev`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
})
