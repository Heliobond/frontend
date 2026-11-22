import { beforeEach, describe, expect, it, vi } from '@/test/bun'
import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'

const TESTNET = 'Test SDF Network ; September 2015'
const PUBLIC = 'Public Global Stellar Network ; September 2015'
const ADDRESS = 'GCKFBEIYTKP5RDBQMTVVALONAOPBXICILMAFKKNOT6QZ4ZIUXM6RLJ5V'

const kit = {
  init: vi.fn(),
  authModal: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  setWallet: vi.fn(),
  disconnect: vi.fn(),
  selectedModule: { productId: 'freighter' },
}

vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: kit,
  Networks: {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
  },
}))
vi.mock('@creit.tech/stellar-wallets-kit/modules/utils', () => ({ defaultModules: () => [] }))

const { WalletProvider, useWallet } = await import('./WalletProvider')
const { NetworkMismatchError, isNetworkMismatch, isNetworkMismatchError, networkMismatchMessage } =
  await import('./networkGuard')

describe('networkGuard helpers', () => {
  it('flags a known, different wallet network as a mismatch', () => {
    expect(isNetworkMismatch(PUBLIC, TESTNET)).toBe(true)
    expect(isNetworkMismatch(TESTNET, TESTNET)).toBe(false)
  })

  it('does not block when the wallet cannot report its network', () => {
    expect(isNetworkMismatch(null, TESTNET)).toBe(false)
  })

  it('explains the mismatch in plain words', () => {
    expect(networkMismatchMessage(PUBLIC, TESTNET)).toBe(
      'Your wallet is set to Mainnet, but Heliobond runs on Testnet. Switch your wallet to Testnet and try again.',
    )
    const err = new NetworkMismatchError(PUBLIC, TESTNET)
    expect(isNetworkMismatchError(err)).toBe(true)
    expect(isNetworkMismatchError(new Error('x'))).toBe(false)
    expect(err.walletPassphrase).toBe(PUBLIC)
  })
})

let wallet: ReturnType<typeof useWallet>
function Probe({ onWallet }: { onWallet: (w: ReturnType<typeof useWallet>) => void }) {
  const current = useWallet()
  useEffect(() => {
    onWallet(current)
  })
  return <span data-testid="mismatch">{String(current.networkMismatch)}</span>
}

function renderProvider() {
  return render(
    <WalletProvider>
      <Probe onWallet={(w) => (wallet = w)} />
    </WalletProvider>,
  )
}

describe('WalletProvider network guard (#611)', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.values(kit).forEach(
      (fn) => typeof fn === 'function' && 'mockReset' in fn && fn.mockReset(),
    )
    kit.authModal.mockResolvedValue({ address: ADDRESS })
    kit.signTransaction.mockResolvedValue({ signedTxXdr: 'SIGNED' })
  })

  it('reads the wallet network after connecting and flags a mismatch', async () => {
    kit.getNetwork.mockResolvedValue({ network: 'PUBLIC', networkPassphrase: PUBLIC })
    renderProvider()
    await act(() => wallet.connect())

    expect(kit.getNetwork).toHaveBeenCalled()
    expect(screen.getByTestId('mismatch')).toHaveTextContent('true')
    expect(wallet.walletNetworkPassphrase).toBe(PUBLIC)
  })

  it('blocks signing before the wallet prompt when networks differ', async () => {
    kit.getNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: TESTNET })
    renderProvider()
    await act(() => wallet.connect())
    expect(screen.getByTestId('mismatch')).toHaveTextContent('false')

    // The user switches the wallet to mainnet after connecting.
    kit.getNetwork.mockResolvedValue({ network: 'PUBLIC', networkPassphrase: PUBLIC })
    let error: unknown
    await act(async () => {
      error = await wallet.sign('XDR').catch((e: unknown) => e)
    })

    expect(isNetworkMismatchError(error)).toBe(true)
    expect((error as Error).message).toContain('Switch your wallet to Testnet')
    expect(kit.signTransaction).not.toHaveBeenCalled()
    expect(screen.getByTestId('mismatch')).toHaveTextContent('true')
  })

  it('signs with the app passphrase when networks match', async () => {
    kit.getNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: TESTNET })
    renderProvider()
    await act(() => wallet.connect())

    let signed: string | undefined
    await act(async () => {
      signed = await wallet.sign('XDR')
    })
    expect(signed).toBe('SIGNED')
    expect(kit.signTransaction).toHaveBeenCalledWith('XDR', {
      networkPassphrase: TESTNET,
      address: ADDRESS,
    })
  })

  it('still signs when the wallet cannot report its network', async () => {
    kit.getNetwork.mockRejectedValue(new Error('not supported'))
    renderProvider()
    await act(() => wallet.connect())
    await act(async () => {
      await wallet.sign('XDR')
    })
    expect(kit.signTransaction).toHaveBeenCalled()
    expect(screen.getByTestId('mismatch')).toHaveTextContent('false')
  })

  it('checkWalletNetwork clears the prompt once the wallet is switched back', async () => {
    kit.getNetwork.mockResolvedValue({ network: 'PUBLIC', networkPassphrase: PUBLIC })
    renderProvider()
    await act(() => wallet.connect())
    expect(screen.getByTestId('mismatch')).toHaveTextContent('true')

    kit.getNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: TESTNET })
    let ok: boolean | undefined
    await act(async () => {
      ok = await wallet.checkWalletNetwork()
    })
    expect(ok).toBe(true)
    await waitFor(() => expect(screen.getByTestId('mismatch')).toHaveTextContent('false'))
  })

  it('never flags demo sessions', async () => {
    renderProvider()
    act(() => wallet.connectDemo())
    await expect(wallet.checkWalletNetwork()).resolves.toBe(true)
    expect(kit.getNetwork).not.toHaveBeenCalled()
    expect(screen.getByTestId('mismatch')).toHaveTextContent('false')
  })
})
