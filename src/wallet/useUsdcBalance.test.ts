import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUsdcBalance } from './useUsdcBalance'
import * as vault from './vault'

const mockWallet = {
  address: 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ',
  isDemo: false,
  network: 'testnet',
}

vi.mock('./WalletProvider', () => ({
  useWallet: () => mockWallet,
}))

vi.mock('./vault', () => ({
  fetchUsdcBalance: vi.fn(),
}))

describe('useUsdcBalance hook (#698)', () => {
  beforeEach(() => {
    vi.stubEnv(
      'NEXT_PUBLIC_USDC_SAC_ID',
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    )
    mockWallet.address = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
    mockWallet.isDemo = false
    vi.mocked(vault.fetchUsdcBalance).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns demo fixture balance (240) when in demo mode', () => {
    mockWallet.isDemo = true
    const { result } = renderHook(() => useUsdcBalance())
    expect(result.current.balance).toBe(240)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(vault.fetchUsdcBalance).not.toHaveBeenCalled()
  })

  it('fetches on-chain USDC balance for connected wallet when SAC ID is configured', async () => {
    vi.mocked(vault.fetchUsdcBalance).mockResolvedValue(5000)
    const { result } = renderHook(() => useUsdcBalance())

    await waitFor(() => {
      expect(result.current.balance).toBe(5000)
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    })
    expect(vault.fetchUsdcBalance).toHaveBeenCalledWith(mockWallet.address, 'testnet')
  })

  it('returns null balance and captures error when RPC call fails', async () => {
    vi.mocked(vault.fetchUsdcBalance).mockRejectedValue(new Error('RPC node timeout'))
    const { result } = renderHook(() => useUsdcBalance())

    await waitFor(() => {
      expect(result.current.balance).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBe('RPC node timeout')
    })
  })

  it('returns null balance when NEXT_PUBLIC_USDC_SAC_ID is not set', () => {
    vi.stubEnv('NEXT_PUBLIC_USDC_SAC_ID', '')
    const { result } = renderHook(() => useUsdcBalance())
    expect(result.current.balance).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(vault.fetchUsdcBalance).not.toHaveBeenCalled()
  })
})
