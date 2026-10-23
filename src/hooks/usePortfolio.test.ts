import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePortfolio } from './usePortfolio'
import * as vault from '../wallet/vault'
import { apiFetch } from '../lib/api'

const A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

const mockWallet = { address: A, isDemo: false, connected: true }

vi.mock('../wallet/WalletProvider', () => ({ useWallet: () => mockWallet }))
vi.mock('../wallet/useVaultRefresh', () => ({
  useVaultRefresh: () => ({ tick: 0, refresh: vi.fn() }),
}))
vi.mock('../wallet/vault', () => ({
  fetchPortfolio: vi.fn(),
  fetchClaimableYield: vi.fn(),
  fetchTotalAssets: vi.fn(),
  fetchUtilizationBps: vi.fn(),
  fetchVaultLiquidUsdc: vi.fn(),
}))
vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))

function position(usdcValue: number) {
  return {
    usdcValue,
    totalDeposited: usdcValue,
    shares: usdcValue,
    shareOfPoolBps: 100,
    claimableYield: 0,
  } as unknown as Awaited<ReturnType<typeof vault.fetchPortfolio>>
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

describe('usePortfolio (#821)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', 'CVAULT')
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    mockWallet.address = A
    setHidden(false)
    vi.mocked(vault.fetchPortfolio).mockReset()
    vi.mocked(vault.fetchClaimableYield).mockResolvedValue(0)
    vi.mocked(vault.fetchTotalAssets).mockResolvedValue(1000)
    vi.mocked(vault.fetchUtilizationBps).mockResolvedValue(0)
    vi.mocked(vault.fetchVaultLiquidUsdc).mockResolvedValue(1000)
    vi.mocked(apiFetch).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    setHidden(false)
  })

  it('never exposes the previous address figures after switching address', async () => {
    vi.mocked(vault.fetchPortfolio).mockImplementation(async (addr) =>
      addr === A ? position(111) : new Promise(() => {}),
    )
    const { result, rerender } = renderHook(() => usePortfolio())
    await waitFor(() => expect(result.current.portfolio?.usdcValue).toBe(111))

    mockWallet.address = B
    rerender()
    expect(result.current.portfolio).toBeNull()
    expect(result.current.you.value).not.toBe(111)
    expect(result.current.loading).toBe(true)
  })

  it('does not fall back to the old address when the new fetch fails', async () => {
    vi.mocked(vault.fetchPortfolio).mockImplementation(async (addr) => {
      if (addr === A) return position(111)
      throw new Error('boom')
    })
    const { result, rerender } = renderHook(() => usePortfolio())
    await waitFor(() => expect(result.current.portfolio?.usdcValue).toBe(111))

    mockWallet.address = B
    rerender()
    await waitFor(() => expect(result.current.error).toBe('portfolioFailed'))
    expect(result.current.portfolio).toBeNull()
  })

  it('ends loading when on-chain calls finish, without waiting for activity', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test')
    vi.mocked(vault.fetchPortfolio).mockResolvedValue(position(5))
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePortfolio())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.portfolio?.usdcValue).toBe(5)
  })

  it('applies activity once it arrives', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test')
    vi.mocked(vault.fetchPortfolio).mockResolvedValue(position(5))
    const feed = [{ id: 'x' }] as never
    vi.mocked(apiFetch).mockResolvedValue(feed)
    const { result } = renderHook(() => usePortfolio())
    await waitFor(() => expect(result.current.activity).toBe(feed))
  })

  it('loads when a tab hidden at mount becomes visible', async () => {
    setHidden(true)
    vi.mocked(vault.fetchPortfolio).mockResolvedValue(position(7))
    const { result } = renderHook(() => usePortfolio())
    await act(async () => {
      await Promise.resolve()
    })
    expect(vault.fetchPortfolio).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(true)

    setHidden(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(result.current.portfolio?.usdcValue).toBe(7))
    expect(result.current.loading).toBe(false)
  })
})
