import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVault } from './useVault'
import { notifyTransactionConfirmed } from './vaultEvents'
import { WalletProvider } from './WalletProvider'
import * as vault from './vault'
import { selectSharePrice, selectTotalAssets } from '../state/selectors'

const TEST_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <WalletProvider>{children}</WalletProvider>
  }
}

describe('useVault', () => {
  beforeEach(() => {
    vi.spyOn(vault, 'fetchSharePrice').mockResolvedValue('1.0000000')
    vi.spyOn(vault, 'fetchTotalAssets').mockResolvedValue(1000000)
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
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('passes connected address and network to fetchSharePrice and fetchTotalAssets', async () => {
    vi.mocked(vault.fetchSharePrice).mockResolvedValue('1.2345000')
    vi.mocked(vault.fetchTotalAssets).mockResolvedValue(1234500)
    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    // Wait for the effect to run
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Verify fetchSharePrice was called with address and network
    expect(vault.fetchSharePrice).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
    // Verify fetchTotalAssets was called with address and network
    expect(vault.fetchTotalAssets).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
    expect(result.current.sharePrice).toBe(1.2345)
    expect(result.current.totalAssets).toBe(1234500)
  })

  it('retains selector values and exposes the error when live reads fail', async () => {
    vi.mocked(vault.fetchSharePrice).mockRejectedValue(new Error('RPC unavailable'))
    vi.mocked(vault.fetchTotalAssets).mockRejectedValue(new Error('RPC unavailable'))
    const { result } = renderHook(() => useVault(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('RPC unavailable')
    expect(result.current.sharePrice).toBe(selectSharePrice())
    expect(result.current.totalAssets).toBe(selectTotalAssets())
  })

  it('passes network from WalletProvider when NEXT_PUBLIC_STELLAR_NETWORK not set', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv(
      'NEXT_PUBLIC_VAULT_CONTRACT_ID',
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH',
    )
    // Don't set NEXT_PUBLIC_STELLAR_NETWORK, should use wallet's network

    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // WalletProvider defaults to TESTNET (from STELLAR_NETWORK_UPPERCASE)
    expect(vault.fetchSharePrice).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
    expect(vault.fetchTotalAssets).toHaveBeenCalledWith(TEST_ADDRESS, 'testnet')
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

    expect(vault.fetchSharePrice).not.toHaveBeenCalled()
    expect(vault.fetchTotalAssets).not.toHaveBeenCalled()
    expect(result.current.sharePrice).toBe(selectSharePrice())
    expect(result.current.totalAssets).toBe(selectTotalAssets())
  })

  it('refreshes immediately when a transaction confirmation event is triggered', async () => {
    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const initialCallCount = vi.mocked(vault.fetchSharePrice).mock.calls.length

    act(() => {
      notifyTransactionConfirmed('tx-hash-123', 'deposit')
    })

    await waitFor(() => {
      expect(vi.mocked(vault.fetchSharePrice).mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })

  it('refreshes immediately when tab becomes visible after visibilitychange', async () => {
    const { result } = renderHook(() => useVault(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const initialCallCount = vi.mocked(vault.fetchSharePrice).mock.calls.length

    // Dispatch visibilitychange event
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(vi.mocked(vault.fetchSharePrice).mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })
  it('defers initial reads and transaction refreshes while hidden until the tab returns', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    vi.mocked(vault.fetchSharePrice).mockResolvedValue('2.0000000')
    vi.mocked(vault.fetchTotalAssets).mockResolvedValue(2000)
    const { result } = renderHook(() => useVault(), { wrapper: createWrapper() })
    act(() => notifyTransactionConfirmed())
    expect(vault.fetchSharePrice).not.toHaveBeenCalled()
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(result.current.sharePrice).toBe(2))
    expect(vault.fetchSharePrice).toHaveBeenCalledTimes(1)
  })
})
