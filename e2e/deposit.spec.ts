import { test, expect } from '@playwright/test'
import { seedDemoWallet } from './wallet-fixtures'

test.describe('Deposit flow — demo mode smoke test', () => {
  test('walks amount → review → pending → success', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    // ── Step 1: Amount ────────────────────────────────────────────────────
    await expect(
      page.getByRole('heading', { name: 'How much would you like to invest?' }),
    ).toBeVisible()

    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('150')

    // Click the invest CTA.
    await page.getByRole('button', { name: /invest 150 usdc/i }).click()

    // ── Step 2: Review ────────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /investing 150 usdc/i })).toBeVisible()
    await expect(page.getByText('You pay')).toBeVisible()
    await expect(page.getByText('150.00 USDC', { exact: true })).toBeVisible()

    // Confirm the deposit.
    // Use Promise.all to avoid a race condition where the 2s demo delay
    // resolves before Playwright can assert the pending step.
    await Promise.all([
      expect(
        page.getByRole('main').getByRole('status').filter({ hasText: 'Confirming your deposit' }),
      ).toBeVisible(),
      page.getByRole('button', { name: /confirm in wallet/i }).click(),
    ])

    // ── Step 4: Success ───────────────────────────────────────────────────
    // Demo mode resolves in ~2 s.
    await expect(page.getByRole('heading', { name: 'Welcome to the pool' })).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: 'Go to portfolio' }).click()
    await expect(page).toHaveURL(/\/portfolio$/)
  })

  test('back button returns from review to amount', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    await expect(
      page.getByRole('heading', { name: 'How much would you like to invest?' }),
    ).toBeVisible()

    const input = page.getByRole('textbox', { name: 'Amount', exact: true })
    await input.fill('125')
    await page.getByRole('button', { name: 'Invest 125 USDC', exact: true }).click()

    await expect(page.getByRole('heading', { name: /investing 125 usdc/i })).toBeVisible()
    await page.getByRole('button', { name: 'Back', exact: true }).click()

    await expect(
      page.getByRole('heading', { name: 'How much would you like to invest?' }),
    ).toBeVisible()
  })

  test('invest button is disabled when the amount is below the 100 USDC minimum', async ({
    page,
  }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('99')
    await expect(page.getByRole('button', { name: 'Invest', exact: true })).toBeDisabled()
  })

  test('quick-select chip sets the amount', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    const input = page.getByRole('textbox', { name: 'Amount', exact: true })
    await input.fill('150')
    await page.getByRole('button', { name: '100', exact: true }).click()

    await expect(input).toHaveValue('100')
    await expect(page.getByRole('button', { name: 'Invest 100 USDC', exact: true })).toBeEnabled()
  })

  test('validates memo length and blocks 100-character memo before sending', async ({ page }) => {
    await seedDemoWallet(page)
    await page.goto('/deposit')

    const memoInput = page.getByPlaceholder('Up to 28 bytes')
    await expect(memoInput).toBeVisible()

    // Enter a 100-character memo
    await memoInput.fill('a'.repeat(100))

    // Validation error should be visible
    await expect(page.getByText('Memo cannot exceed 28 bytes (currently 100 bytes).')).toBeVisible()

    // Invest button should be disabled with reason
    const investBtn = page.getByRole('button', { name: 'Invest 100 USDC', exact: true })
    await expect(investBtn).toBeDisabled()

    // Now enter a valid memo <= 28 bytes
    await memoInput.fill('valid-memo-123')
    await expect(page.getByText('Memo cannot exceed 28 bytes')).not.toBeVisible()
    await expect(investBtn).toBeEnabled()

    // Proceed to review and verify memo is shown
    await investBtn.click()
    await expect(page.getByText('valid-memo-123')).toBeVisible()
  })
})
