import { execFileSync } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'

/**
 * Full investor journey against real contracts on a local stellar/quickstart
 * network (#607). Every transaction is built by the app, signed by the
 * keypair-backed E2E test wallet module and executed by the deployed
 * InvestmentVault, so an ABI mismatch in src/wallet/vault.ts fails here.
 *
 * Prerequisite: scripts/e2e/setup-local-network.sh (see playwright.chain.config.ts).
 */

const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — run scripts/e2e/setup-local-network.sh first`)
  return value
}

/** Make the injected test wallet available before the app boots. */
async function injectTestWallet(page: Page, networkPassphrase?: string) {
  await page.addInitScript(
    (cfg) => {
      window.__HB_E2E_WALLET__ = cfg
    },
    { secret: env('E2E_INVESTOR_SECRET'), networkPassphrase },
  )
}

/** Invoke a vault function as the admin through the stellar CLI. */
function adminInvoke(fn: string, args: string[]) {
  return execFileSync(
    'stellar',
    [
      'contract',
      'invoke',
      '--id',
      env('NEXT_PUBLIC_VAULT_CONTRACT_ID'),
      '--source',
      env('E2E_ADMIN_ALIAS'),
      '--network',
      env('E2E_NETWORK'),
      '--',
      fn,
      ...args,
    ],
    { encoding: 'utf8' },
  ).trim()
}

/** Read a USDC figure like "$149.25" from a StatBlock. */
async function amountIn(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? ''
  return Number(text.replace(/[^0-9.]/g, ''))
}

test('connect → explore → project → deposit → portfolio → withdraw → claim yield', async ({
  page,
}) => {
  expect(env('NEXT_PUBLIC_USDC_SAC_ID')).toBe(env('E2E_USDC_SAC'))
  await injectTestWallet(page)

  await test.step('explore and open a project', async () => {
    await page.goto('/explore')
    await expect(page.getByTestId('network-pill')).toHaveText('STANDALONE')
    // With NEXT_PUBLIC_REGISTRY_CONTRACT_ID set, explore loads live on-chain projects
    // from the ProjectRegistry contract rather than static fixtures (#720).
    await expect(page.locator('article')).toHaveCount(1)
    await page.locator('article').first().click()
    await expect(page).toHaveURL(/\/project\/\d+/)
  })

  await test.step('invest → connect with the test wallet', async () => {
    await page.getByRole('button', { name: 'Invest in the pool that funds this' }).click()
    await expect(page).toHaveURL(/\/connect/)
    await page.getByRole('button', { name: 'Connect wallet' }).first().click()
    await page.getByText('E2E Test Wallet').click()
    // Connecting returns to the deposit flow.
    await expect(page).toHaveURL(/\/deposit/)
    await expect(page.getByTestId('network-mismatch')).toHaveCount(0)
  })

  await test.step('deposit 150 USDC on-chain', async () => {
    await expect(
      page.getByRole('heading', { name: 'How much would you like to invest?' }),
    ).toBeVisible()
    await expect(page.getByText('Balance 1000.00 USDC', { exact: true })).toBeVisible()
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('150')
    await page.getByRole('button', { name: /invest 150 usdc/i }).click()
    await page.getByRole('button', { name: /confirm in wallet/i }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to the pool' })).toBeVisible({
      timeout: 90_000,
    })

    await page.getByRole('button', { name: 'Transaction activity history' }).click()
    const activity = page.getByRole('dialog')
    await expect(activity.getByRole('button', { name: 'Copy transaction hash' })).toBeVisible()
    await expect(activity.getByRole('link', { name: /stellar expert/i })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  await test.step('portfolio shows the minted shares', async () => {
    await page.getByRole('button', { name: 'Go to portfolio' }).click()
    await expect(page).toHaveURL(/\/portfolio/)
    // 150 USDC minus the 0.5% insurance premium, minted 1:1 into an empty vault.
    await expect(page.getByTestId('onchain-shares')).toContainText('149.25')
  })

  await test.step('deposit debits 150 USDC from the wallet', async () => {
    await page.goto('/deposit')
    await expect(page.getByText('Balance 850.00 USDC', { exact: true })).toBeVisible()
  })

  await test.step('withdraw reaches the contract (deposit lock-up applies)', async () => {
    // InvestmentVault locks new deposits for MIN_LOCK_PERIOD (24 h), and a
    // local network can't fast-forward ledger time. Reaching DepositLocked
    // (#36) proves the withdraw(from, shares_amount, min_usdc_return)
    // arguments decode: a wrong argument list fails before the lock check.
    await page.goto('/withdraw')
    await page.locator('input').first().fill('100')
    await page.getByRole('button', { name: /withdraw \$100/i }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Error(Contract, #36)' })).toBeVisible({
      timeout: 60_000,
    })
  })

  await test.step('claim yield', async () => {
    // The admin pays 10 USDC of yield into the vault.
    adminInvoke('receive_yield', ['--from', env('E2E_ADMIN_ADDRESS'), '--amount', '100000000'])

    await page.goto('/portfolio')
    await expect.poll(() => amountIn(page, 'onchain-claimable-yield')).toBeGreaterThan(9.9)
    await page.getByRole('button', { name: 'Claim yield' }).click()
    await expect(page.getByText('Yield claimed')).toBeVisible({ timeout: 90_000 })
    await expect.poll(() => amountIn(page, 'onchain-claimable-yield')).toBe(0)
  })
})

test('a wallet on another network is blocked before signing', async ({ page }) => {
  await injectTestWallet(page, 'Public Global Stellar Network ; September 2015')
  await page.goto('/connect')
  await page.getByRole('button', { name: 'Connect wallet' }).first().click()
  await page.getByText('E2E Test Wallet').click()

  const banner = page.getByTestId('network-mismatch')
  await expect(banner).toContainText('Your wallet is set to Mainnet')
  await expect(banner).toContainText('Switch your wallet to Standalone')

  await page.goto('/deposit')
  await page.locator('input').first().fill('150')
  await page.getByRole('button', { name: /invest 150 usdc/i }).click()
  await page.getByRole('button', { name: /confirm in wallet/i }).click()
  await expect(page.getByText(/Switch your wallet to Standalone/).last()).toBeVisible({
    timeout: 60_000,
  })
})
