import { test, expect } from '@playwright/test'

test('wallet connect and disconnect respect the withdraw route guard', async ({ page }) => {
  await page.goto('/withdraw')
  await expect(page).toHaveURL(/\/connect\?next=%2Fwithdraw/)

  await page.getByRole('button', { name: /try the demo/i }).click()
  await expect(page).toHaveURL(/\/withdraw$/)
  await expect(page.getByRole('heading', { name: 'Withdraw from the pool' })).toBeVisible()

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Disconnect' }).click()
  await page.getByRole('button', { name: 'Yes, disconnect' }).click()

  await page.goto('/withdraw')
  await expect(page).toHaveURL(/\/connect\?next=%2Fwithdraw/)
})
