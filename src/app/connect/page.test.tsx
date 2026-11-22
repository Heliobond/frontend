import { describe, it, expect, vi, beforeEach } from '@/test/bun'

const mockReplace = vi.fn()
let mockSearch = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

let walletConnected: boolean
const connect = vi.fn()
const connectDemo = vi.fn()

vi.mock('../../wallet/WalletProvider', () => ({
  useWallet: () => ({ connected: walletConnected, connect, connectDemo }),
}))

vi.mock('../../screens/Connect', () => ({
  Connect: ({
    onWallet,
    onNew,
    onCancel,
  }: {
    onWallet: () => void
    onNew: () => void
    onCancel: () => void
  }) => (
    <div>
      <button onClick={onWallet}>connect wallet</button>
      <button onClick={onNew}>start with email</button>
      <button onClick={onCancel}>keep exploring</button>
    </div>
  ),
}))

const { render, screen, waitFor, act } = await import('@/test/render')
const { default: ConnectPage } = await import('./page')

describe('ConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearch = ''
    walletConnected = false
  })

  it('lets a returning (restored-session) user stay on the Connect screen', () => {
    walletConnected = true
    render(<ConnectPage />)
    expect(screen.getByText('connect wallet')).toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('advances to the default stop after an explicit connect action', async () => {
    const { rerender } = render(<ConnectPage />)
    screen.getByText('connect wallet').click()
    expect(connect).toHaveBeenCalled()
    act(() => {
      walletConnected = true
    })
    rerender(<ConnectPage />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/deposit')
    })
  })

  it('honours the return target when a guard sent the visitor here', async () => {
    mockSearch = 'next=%2Fportfolio'
    const { rerender } = render(<ConnectPage />)
    screen.getByText('start with email').click()
    expect(connectDemo).toHaveBeenCalled()
    act(() => {
      walletConnected = true
    })
    rerender(<ConnectPage />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/portfolio')
    })
  })
})
