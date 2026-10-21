import { test, expect } from '@playwright/test'
import { seedDemoWallet } from './wallet-fixtures'

test.describe('Withdraw flow — demo mode smoke test', () => {
  test('walks amount → pending → success', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/withdraw')

    await expect(page.getByRole('heading', { name: 'Withdraw from the pool' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Amount' }).fill('150')
    await Promise.all([
      expect(page.getByRole('heading', { name: 'Processing your withdrawal' })).toBeVisible(),
      page.getByRole('button', { name: /withdraw \$150/i }).click(),
    ])
    await expect(page.getByRole('heading', { name: 'Withdrawal settled' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: 'Back to portfolio' })).toBeVisible()
  })

  test('shows the locked state and disables withdrawal until unlock', async ({ page }) => {
    const unlockAt = Math.floor(Date.now() / 1000) + 3600
    await seedDemoWallet(page, { lockExpiresAt: unlockAt })
    await page.goto('/withdraw')

    await expect(page.getByRole('heading', { name: 'Withdraw from the pool' })).toBeVisible()
    const withdrawButton = page.getByRole('button', { name: /withdraw/i }).first()
    await expect(withdrawButton).toBeDisabled()
    await expect(withdrawButton).toHaveAttribute('title', /withdrawals unlock in/i)
  })
})
