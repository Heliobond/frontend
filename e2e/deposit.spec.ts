import { test, expect } from '@playwright/test'

const DEMO_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

/**
 * Seed a demo wallet session via localStorage so the deposit flow works
 * end-to-end without requiring a real Stellar wallet extension.
 */
async function seedDemoWallet(page: import('@playwright/test').Page) {
  await page.addInitScript(
    ({ address }) => {
      localStorage.setItem('hb-address', address)
      localStorage.setItem('hb-wallet', 'demo')
    },
    { address: DEMO_ADDRESS },
  )
}

test.describe('Deposit flow — demo mode smoke test', () => {
  test('walks amount → review → pending → success', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    // ── Step 1: Amount ────────────────────────────────────────────────────
    await expect(
      page.getByRole('heading', { name: 'How much would you like to invest?' }),
    ).toBeVisible()

    // Clear the default amount and type a new one.
    const amountInput = page
      .locator('input[type="text"], input:not([type="number"])')
      .or(page.locator('input'))
      .first()
    await amountInput.fill('50')

    // Click the invest CTA.
    await page.getByRole('button', { name: /invest 50 usdc/i }).click()

    // ── Step 2: Review ────────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /investing 50 usdc/i })).toBeVisible()
    await expect(page.getByText('You pay')).toBeVisible()
    await expect(page.getByText('50.00 USDC')).toBeVisible()

    // Confirm the deposit.
    await page.getByRole('button', { name: /confirm in wallet/i }).click()

    // ── Step 3: Pending ───────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Confirming your deposit' })).toBeVisible()

    // ── Step 4: Success ───────────────────────────────────────────────────
    // Demo mode resolves in ~2 s.
    await expect(page.getByRole('heading', { name: 'Welcome to the pool' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('link', { name: 'View on Stellar Expert' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to portfolio' })).toBeVisible()
  })

  test('back button returns from review to amount', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    await expect(
      page.getByRole('heading', { name: 'How much would you like to invest?' }),
    ).toBeVisible()

    const input = page.locator('input').first()
    await input.fill('25')
    await page.getByRole('button', { name: /invest 25 usdc/i }).click()

    await expect(page.getByRole('heading', { name: /investing 25 usdc/i })).toBeVisible()
    await page.getByRole('button', { name: /back/i }).click()

    await expect(
      page.getByRole('heading', { name: 'How much would you like to invest?' }),
    ).toBeVisible()
  })

  test('invest button is disabled when amount is below 1 USDC', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    const input = page.locator('input').first()
    await input.fill('0')

    const investBtn = page.getByRole('button', { name: /invest/i }).first()
    await expect(investBtn).toBeDisabled()
  })

  test('quick-select chip sets the amount', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    // Click the 100 chip.
    await page.getByRole('button', { name: '100' }).click()

    await expect(page.getByRole('button', { name: /invest 100 usdc/i })).toBeVisible()
  })
})
