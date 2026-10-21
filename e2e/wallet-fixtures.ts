import type { Page } from '@playwright/test'

export const DEMO_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

export async function seedDemoWallet(page: Page, options: { lockExpiresAt?: number } = {}) {
  await page.addInitScript(
    ({ address, lockExpiresAt }) => {
      localStorage.setItem('hb-address', address)
      localStorage.setItem('hb-wallet', 'demo')
      if (lockExpiresAt !== undefined) {
        localStorage.setItem('hb-e2e-withdraw-lock-expires-at', String(lockExpiresAt))
      }
    },
    { address: DEMO_ADDRESS, lockExpiresAt: options.lockExpiresAt },
  )
}
