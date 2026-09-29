import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVault } from './useVault'
import { notifyTransactionConfirmed } from './vaultEvents'
import { WalletProvider } from './WalletProvider'

const mockFetchSharePrice = vi.fn()
const mockFetchTotalAssets = vi.fn()

vi.mock('./vault', () => ({
  fetchSharePrice: (...args: unknown[]) => mockFetchSharePrice(...args),
  fetchTotalAssets: (...args: unknown[]) => mockFetchTotalAssets(...args),
}))

vi.mock('../state/selectors', () => ({
  selectSharePrice: () => 1.0,
  selectTotalAssets: () => 1000,
}))

const TEST_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <WalletProvider>{children}</WalletProvider>
  }
}

describe('useVault', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    localStorage.setItem('hb-address', TEST_ADDRESS)
    localStorage.removeItem('hb-wallet')
    // Mock contract ID and RPC URL
    vi.stubEnv(
      'NEXT_PUBLIC_VAULT_CONTRACT_ID',
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH',
    )
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('passes connected address and network to fetchSharePrice and fetchTotalAssets', async () => {
    mockFetchSharePrice.mockResolvedValue('1.0000000')
    mockFetchTotalAssets.mockResolvedValue(1000000)

    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    // Wait for the effect to run
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Verify fetchSharePrice was called with address and network
    expect(mockFetchSharePrice).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
    // Verify fetchTotalAssets was called with address and network
    expect(mockFetchTotalAssets).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
  })

  it('passes network from WalletProvider when NEXT_PUBLIC_STELLAR_NETWORK not set', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv(
      'NEXT_PUBLIC_VAULT_CONTRACT_ID',
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH',
    )
    // Don't set NEXT_PUBLIC_STELLAR_NETWORK, should use wallet's network

    mockFetchSharePrice.mockResolvedValue('1.0000000')
    mockFetchTotalAssets.mockResolvedValue(1000000)

    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // WalletProvider defaults to TESTNET (from STELLAR_NETWORK_UPPERCASE)
    expect(mockFetchSharePrice).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
    expect(mockFetchTotalAssets).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
  })

  it('does not call fetchers when no contract ID', async () => {
    vi.unstubAllEnvs()
    // No NEXT_PUBLIC_VAULT_CONTRACT_ID

    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockFetchSharePrice).not.toHaveBeenCalled()
    expect(mockFetchTotalAssets).not.toHaveBeenCalled()
  })

  it('refreshes immediately when a transaction confirmation event is triggered', async () => {
    mockFetchSharePrice.mockResolvedValue('1.0000000')
    mockFetchTotalAssets.mockResolvedValue(1000000)

    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const initialCallCount = mockFetchSharePrice.mock.calls.length

    act(() => {
      notifyTransactionConfirmed('tx-hash-123', 'deposit')
    })

    await waitFor(() => {
      expect(mockFetchSharePrice.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })

  it('refreshes immediately when tab becomes visible after visibilitychange', async () => {
    mockFetchSharePrice.mockResolvedValue('1.0000000')
    mockFetchTotalAssets.mockResolvedValue(1000000)

    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const initialCallCount = mockFetchSharePrice.mock.calls.length

    // Dispatch visibilitychange event
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(mockFetchSharePrice.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })
  it('defers initial reads and transaction refreshes while hidden until the tab returns', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    mockFetchSharePrice.mockResolvedValue('2.0000000')
    mockFetchTotalAssets.mockResolvedValue(2000)
    const { result } = renderHook(() => useVault(), { wrapper: createWrapper() })
    act(() => notifyTransactionConfirmed())
    expect(mockFetchSharePrice).not.toHaveBeenCalled()
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(result.current.sharePrice).toBe(2))
    expect(mockFetchSharePrice).toHaveBeenCalledTimes(1)
  })
})
