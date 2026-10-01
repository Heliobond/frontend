import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUsdcBalance, DEMO_USDC_BALANCE } from './useUsdcBalance'
import { notifyTransactionConfirmed } from './vaultEvents'
import { WalletProvider } from './WalletProvider'

const mockFetchUsdcBalance = vi.fn()

vi.mock('./vault', () => ({
  fetchUsdcBalance: (...args: unknown[]) => mockFetchUsdcBalance(...args),
}))

const TEST_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
const TEST_SAC_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <WalletProvider>{children}</WalletProvider>
  }
}

describe('useUsdcBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    localStorage.setItem('hb-address', TEST_ADDRESS)
    localStorage.setItem('hb-wallet', 'freighter')
    vi.stubEnv('NEXT_PUBLIC_USDC_SAC_ID', TEST_SAC_ID)
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('returns fixture balance of 240 in demo mode', () => {
    localStorage.setItem('hb-wallet', 'demo')
    localStorage.setItem('hb-address', 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX')
    const { result } = renderHook(() => useUsdcBalance(), {
      wrapper: createWrapper(),
    })

    expect(result.current.balance).toBe(DEMO_USDC_BALANCE)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockFetchUsdcBalance).not.toHaveBeenCalled()
  })

  it('fetches live USDC balance for connected real wallet', async () => {
    mockFetchUsdcBalance.mockResolvedValue(1500)

    const { result } = renderHook(() => useUsdcBalance(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.balance).toBe(1500)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockFetchUsdcBalance).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
  })

  it('handles read failure gracefully by setting balance to null', async () => {
    mockFetchUsdcBalance.mockRejectedValue(new Error('RPC rate limited'))

    const { result } = renderHook(() => useUsdcBalance(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.balance).toBeNull()
    expect(result.current.error).toBe('RPC rate limited')
  })

  it('refetches when a transaction confirms', async () => {
    mockFetchUsdcBalance.mockResolvedValueOnce(500)

    const { result } = renderHook(() => useUsdcBalance(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.balance).toBe(500)
    })

    mockFetchUsdcBalance.mockResolvedValueOnce(400)
    act(() => {
      notifyTransactionConfirmed('tx123')
    })

    await waitFor(() => {
      expect(result.current.balance).toBe(400)
    })
    expect(mockFetchUsdcBalance).toHaveBeenCalledTimes(2)
  })

  it('returns null balance when NEXT_PUBLIC_USDC_SAC_ID is not configured for a real wallet', async () => {
    vi.stubEnv('NEXT_PUBLIC_USDC_SAC_ID', '')

    const { result } = renderHook(() => useUsdcBalance(), {
      wrapper: createWrapper(),
    })

    expect(result.current.balance).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(mockFetchUsdcBalance).not.toHaveBeenCalled()
  })
})
