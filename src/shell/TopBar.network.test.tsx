import { beforeEach, describe, expect, it, vi } from '@/test/bun'

const wallet = {
  connected: true,
  address: 'GCKFBEIYTKP5RDBQMTVVALONAOPBXICILMAFKKNOT6QZ4ZIUXM6RLJ5V',
  connecting: false,
  isDemo: false,
  disconnect: vi.fn(),
  networkMismatch: false,
  walletNetworkPassphrase: null as string | null,
  checkWalletNetwork: vi.fn(),
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}))

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => wallet,
  shortAddress: (address: string) => address,
}))

const { fireEvent, render, screen } = await import('@/test/render')
const { NetworkPill, TopBar } = await import('./TopBar')

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: class {
    observe() {}
    disconnect() {}
  },
})

describe('network indicator (#611)', () => {
  beforeEach(() => {
    wallet.networkMismatch = false
    wallet.walletNetworkPassphrase = null
    wallet.checkWalletNetwork.mockReset()
  })

  it('shows a persistent TESTNET pill on testnet builds', () => {
    render(<TopBar />)
    expect(screen.getByTestId('network-pill')).toHaveTextContent('TESTNET')
  })

  it('names other non-mainnet networks', () => {
    render(<NetworkPill passphrase="Standalone Network ; February 2017" />)
    expect(screen.getByTestId('network-pill')).toHaveTextContent('STANDALONE')
  })

  it('shows no pill on mainnet', () => {
    render(<NetworkPill passphrase="Public Global Stellar Network ; September 2015" />)
    expect(screen.queryByTestId('network-pill')).toBeNull()
  })

  it('prompts the user to switch when the wallet is on another network', () => {
    wallet.networkMismatch = true
    wallet.walletNetworkPassphrase = 'Public Global Stellar Network ; September 2015'
    render(<TopBar />)

    const banner = screen.getByTestId('network-mismatch')
    expect(banner).toHaveTextContent(
      'Your wallet is set to Mainnet, but Heliobond runs on Testnet. Switch your wallet to Testnet and try again.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(wallet.checkWalletNetwork).toHaveBeenCalled()
  })

  it('shows no prompt when the networks match', () => {
    render(<TopBar />)
    expect(screen.queryByTestId('network-mismatch')).toBeNull()
  })
})
