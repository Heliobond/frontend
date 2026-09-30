/**
 * Regression tests for #595: a deliberate Disconnect must not leave the app
 * showing the offline banner on the next visit.
 *
 * The banner used to read a second localStorage key (`stellar-wallet-connected`)
 * that `disconnect()` never cleared, so the flag stayed true forever and the
 * banner appeared on every load after a manual disconnect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/render'
import type { DisconnectReason } from '@/wallet/WalletProvider'

let walletState = { connected: false, lastDisconnectReason: null as DisconnectReason | null }
/** Reachability comes from the shared Horizon poller, mocked below. */
let horizonState = { isOnline: true }

vi.mock('@/hooks/useHorizonHealth', () => ({
  useHorizonHealth: () => horizonState,
}))

vi.mock('@/wallet/WalletProvider', async () => {
  const actual =
    await vi.importActual<typeof import('@/wallet/WalletProvider')>('@/wallet/WalletProvider')
  return { ...actual, useWallet: () => walletState }
})

import { OfflineBanner } from './providers'

const banner = () => screen.queryByText(/offline/i)

describe('OfflineBanner (#595)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    walletState = { connected: false, lastDisconnectReason: null }
    horizonState = { isOnline: true }
  })

  it('stays hidden after a deliberate disconnect (#595)', () => {
    walletState = { connected: false, lastDisconnectReason: 'user' }
    render(<OfflineBanner />)
    expect(banner()).not.toBeInTheDocument()
  })

  /**
   * The exact reported bug: a stale flag left in localStorage by an earlier
   * session must not resurrect the banner on the next page load.
   */
  it('ignores a stale connected flag left behind by a previous session (#595)', () => {
    localStorage.setItem('stellar-wallet-connected', 'true')
    walletState = { connected: false, lastDisconnectReason: 'user' }
    render(<OfflineBanner />)
    expect(banner()).not.toBeInTheDocument()
  })

  it('writes no connected flag of its own (#595)', () => {
    walletState = { connected: true, lastDisconnectReason: null }
    render(<OfflineBanner />)
    expect(localStorage.getItem('stellar-wallet-connected')).toBeNull()
  })

  it('warns when the session is lost unexpectedly, not by choice', () => {
    walletState = { connected: false, lastDisconnectReason: 'lost' }
    render(<OfflineBanner />)
    expect(banner()).toBeInTheDocument()
  })

  it('stays hidden while connected and online', () => {
    walletState = { connected: true, lastDisconnectReason: null }
    render(<OfflineBanner />)
    expect(banner()).not.toBeInTheDocument()
  })

  it('warns on a network drop even while connected', () => {
    walletState = { connected: true, lastDisconnectReason: null }
    horizonState = { isOnline: false }
    render(<OfflineBanner />)
    expect(banner()).toBeInTheDocument()
  })

  it('warns on a network drop after a deliberate disconnect', () => {
    // A real outage still has to be reported, whatever the last disconnect was.
    walletState = { connected: false, lastDisconnectReason: 'user' }
    horizonState = { isOnline: false }
    render(<OfflineBanner />)
    expect(banner()).toBeInTheDocument()
  })

  it('recovers once connectivity returns', () => {
    const { rerender } = render(<OfflineBanner />)
    expect(banner()).not.toBeInTheDocument()

    horizonState = { isOnline: false }
    rerender(<OfflineBanner />)
    expect(banner()).toBeInTheDocument()

    horizonState = { isOnline: true }
    rerender(<OfflineBanner />)
    expect(banner()).not.toBeInTheDocument()
  })

  it('clears the banner once the wallet reconnects', () => {
    horizonState = { isOnline: false }
    walletState = { connected: false, lastDisconnectReason: 'lost' }
    const { rerender } = render(<OfflineBanner />)
    expect(banner()).toBeInTheDocument()

    horizonState = { isOnline: true }
    walletState = { connected: true, lastDisconnectReason: null }
    rerender(<OfflineBanner />)
    expect(banner()).not.toBeInTheDocument()
  })
})
