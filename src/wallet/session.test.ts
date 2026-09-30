/**
 * The persisted session store backing `WalletProvider` (#595, #598).
 *
 * It replaces localStorage reads inside effects, so the invariants that matter
 * are: a stable snapshot for `useSyncExternalStore`, notification on every
 * write, and tolerance for storage being unavailable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ADDRESS_KEY,
  DEMO_WALLET_ID,
  NETWORK_KEY,
  WALLET_KEY,
  clearSession,
  getServerSession,
  getSession,
  readSession,
  saveNetwork,
  saveSession,
  subscribeSession,
} from './session'

const ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

describe('wallet session store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reports an empty session when nothing is stored', () => {
    expect(readSession()).toEqual({ address: '', walletId: null, network: null })
  })

  it('round-trips an address and wallet id', () => {
    saveSession(ADDRESS, 'freighter')
    expect(localStorage.getItem(ADDRESS_KEY)).toBe(ADDRESS)
    expect(localStorage.getItem(WALLET_KEY)).toBe('freighter')
    expect(readSession()).toEqual({ address: ADDRESS, walletId: 'freighter', network: null })
  })

  it('round-trips the demo wallet id', () => {
    saveSession(ADDRESS, DEMO_WALLET_ID)
    expect(readSession().walletId).toBe(DEMO_WALLET_ID)
  })

  it('clears both address and wallet on disconnect', () => {
    saveSession(ADDRESS, 'freighter')
    clearSession()
    expect(localStorage.getItem(ADDRESS_KEY)).toBeNull()
    expect(localStorage.getItem(WALLET_KEY)).toBeNull()
    expect(readSession().address).toBe('')
  })

  it('keeps the network across a disconnect', () => {
    saveNetwork('TESTNET')
    clearSession()
    expect(readSession().network).toBe('TESTNET')
  })

  it.each(['PUBLIC', 'TESTNET'] as const)('accepts the %s network', (network) => {
    saveNetwork(network)
    expect(localStorage.getItem(NETWORK_KEY)).toBe(network)
  })

  it('ignores a corrupted network value', () => {
    localStorage.setItem(NETWORK_KEY, 'mainnet')
    expect(readSession().network).toBeNull()
  })

  it('notifies subscribers when a session is saved', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSession(listener)
    saveSession(ADDRESS, 'freighter')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    saveSession(ADDRESS, 'other')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers when a session is cleared', () => {
    saveSession(ADDRESS, 'freighter')
    const listener = vi.fn()
    const unsubscribe = subscribeSession(listener)
    clearSession()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('keeps the snapshot referentially stable between writes', () => {
    const unsubscribe = subscribeSession(() => {})
    const first = getSession()
    expect(getSession()).toBe(first)
    unsubscribe()
  })

  it('returns a fresh snapshot after a write', () => {
    const unsubscribe = subscribeSession(() => {})
    const before = getSession()
    saveSession(ADDRESS, 'freighter')
    expect(getSession()).not.toBe(before)
    unsubscribe()
  })

  it('has no session on the server, so hydration matches', () => {
    expect(getServerSession()).toEqual({ address: '', walletId: null, network: null })
  })

  it('stops when a tab is torn down', () => {
    const unsubscribe = subscribeSession(() => {})
    unsubscribe()
    expect(localStorage.getItem(ADDRESS_KEY)).toBeNull()
  })

  it('survives storage that throws on write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveSession(ADDRESS, 'freighter')).not.toThrow()
    setItem.mockRestore()
  })

  it('survives storage that throws on read', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readSession()).toEqual({ address: '', walletId: null, network: null })
    getItem.mockRestore()
  })
})
