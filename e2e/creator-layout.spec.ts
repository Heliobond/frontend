import { expect, test } from '@playwright/test'

for (const [width, expectedColumns] of [
  [320, 1],
  [1280, 2],
] as const) {
  test(`creator application uses ${expectedColumns} columns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/creator?tab=apply')
    const organization = page.getByLabel('Organization name')
    await expect(organization).toBeVisible()

    const grid = page.locator('.hb-application-grid')
    const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)
    expect(columns.split(' ')).toHaveLength(expectedColumns)
    if (expectedColumns === 1) {
      const field = await organization.boundingBox()
      const bounds = await grid.boundingBox()
      expect(field!.width).toBeGreaterThan(bounds!.width * 0.75)
    }
  })
}
