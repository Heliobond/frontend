import { defineConfig, devices } from '@playwright/test'

const isProductionCSP = process.env.E2E_PRODUCTION === 'true'

/**
 * CI runs the specs against a production build (`next start`) instead of the dev
 * server, so the suite exercises what actually ships (#596). The build is run by
 * the e2e job beforehand; this only selects the server command and port.
 */
const useProductionServer = process.env.E2E_PRODUCTION_SERVER === 'true'

const productionPort = Number(process.env.E2E_PRODUCTION_PORT || 3200)
const port = useProductionServer || isProductionCSP ? productionPort : 3000
const baseURL = `http://localhost:${port}`

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
  ],
  webServer: isProductionCSP
    ? {
        command: `bun run build && PORT=${productionPort} CSP_MODE=enforce bun run start`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : useProductionServer
      ? {
          // The caller has already built; only start the server here.
          command: `PORT=${productionPort} bun run start`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        }
      : {
          command: 'bun run dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
})
