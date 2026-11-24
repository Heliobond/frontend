import { afterEach, beforeEach, describe, expect, it, vi } from '@/test/bun'
import { DEFAULT_TIMEOUT_MS, DEFAULT_WARNING_MS } from '@/hooks/useSessionTimeout'

const disconnect = vi.fn()

await vi.mockModule(import.meta.resolve('@/wallet/WalletProvider'), async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/wallet/WalletProvider')>()),
  useWallet: () => ({ connected: true, disconnect }),
}))

const { act, fireEvent, render, screen } = await import('@/test/render')
const { SessionWatcher } = await import('./providers')

describe('SessionWatcher', () => {
  beforeEach(() => {
    disconnect.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => vi.useRealTimers())

  it('disconnects manually without an expiry toast', () => {
    render(<SessionWatcher />)
    act(() => vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS - DEFAULT_WARNING_MS))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect now' }))

    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })

  it('disconnects and announces expiration when time runs out', () => {
    render(<SessionWatcher />)
    act(() => vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS))

    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Session expired')).toBeInTheDocument()
  })
})
