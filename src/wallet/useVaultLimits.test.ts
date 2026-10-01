/**
 * `useVaultLimits` fetches the on-chain limits for the connected wallet.
 *
 * `loading` is derived from the request key that has settled rather than being
 * toggled inside the effect (#598), so these tests pin that contract: the
 * spinner is on until the fetch resolves, and off afterwards.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fetchVaultLimits = vi.fn()
vi.mock('./vault', () => ({
  fetchVaultLimits: (...args: unknown[]) => fetchVaultLimits(...args),
}))

const wallet = {
  address: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H' as string | null,
  isDemo: false,
  network: 'TESTNET' as 'PUBLIC' | 'TESTNET',
}
vi.mock('./WalletProvider', () => ({ useWallet: () => wallet }))

vi.mock('./useVaultRefresh', () => ({ useVaultRefresh: () => ({ tick: 0 }) }))

import { useVaultLimits } from './useVaultLimits'

const LIMITS = {
  paused: true,
  minDeposit: 100,
  minWithdrawShares: 100,
  maxTx: 482,
  lockExpiresAt: 1234567890,
  utilizationBps: 500,
}

const visible = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
}

beforeEach(() => {
  vi.stubEnv(
    'NEXT_PUBLIC_VAULT_CONTRACT_ID',
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD7K5',
  )
  visible(false)
  wallet.address = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
  wallet.isDemo = false
  fetchVaultLimits.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  visible(false)
})

it('exposes the fetched limits', async () => {
  fetchVaultLimits.mockResolvedValue(LIMITS)
  const { result } = renderHook(() => useVaultLimits())
  await waitFor(() => expect(result.current.paused).toBe(true))
  expect(result.current.maxTx).toBe(482)
  expect(result.current.utilizationBps).toBe(500)
})

it('is loading until the request settles, then not', async () => {
  let resolve: (value: typeof LIMITS) => void = () => {}
  fetchVaultLimits.mockReturnValue(
    new Promise<typeof LIMITS>((r) => {
      resolve = r
    }),
  )
  const { result } = renderHook(() => useVaultLimits())
  await waitFor(() => expect(result.current.loading).toBe(true))

  await act(async () => {
    resolve(LIMITS)
  })
  await waitFor(() => expect(result.current.loading).toBe(false))
})

it('stops loading when the request fails, keeping the defaults', async () => {
  fetchVaultLimits.mockRejectedValue(new Error('rpc down'))
  const { result } = renderHook(() => useVaultLimits())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.paused).toBe(false)
  expect(result.current.maxTx).toBe(100000)
})

it('is not loading and does not fetch when no vault is configured', async () => {
  vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', '')
  const { result } = renderHook(() => useVaultLimits())
  expect(result.current.loading).toBe(false)
  expect(fetchVaultLimits).not.toHaveBeenCalled()
})

it('is not loading and does not fetch for a demo wallet', async () => {
  wallet.isDemo = true
  const { result } = renderHook(() => useVaultLimits())
  expect(result.current.loading).toBe(false)
  expect(fetchVaultLimits).not.toHaveBeenCalled()
})

it('does not fetch while the tab is hidden', async () => {
  visible(true)
  renderHook(() => useVaultLimits())
  expect(fetchVaultLimits).not.toHaveBeenCalled()
})

it('is not loading when there is no address', async () => {
  wallet.address = null
  const { result } = renderHook(() => useVaultLimits())
  expect(result.current.loading).toBe(false)
  expect(fetchVaultLimits).not.toHaveBeenCalled()
})
