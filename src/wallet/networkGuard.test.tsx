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
const { clearSession } = await import('./session')
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
    clearSession()
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

  it('keeps both busy flags set while the automatic retry is waiting for the wallet', async () => {
    vi.useFakeTimers()
    try {
      const second = Promise.withResolvers<{ address: string }>()
      kit.authModal
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockReturnValueOnce(second.promise)
      kit.getNetwork.mockResolvedValue({ networkPassphrase: TESTNET })
      renderProvider()

      let connecting!: Promise<void>
      await act(async () => {
        connecting = wallet.connect()
        await vi.dynamicImportSettled()
        await vi.advanceTimersByTimeAsync(16_000)
      })
      expect(kit.authModal).toHaveBeenCalledTimes(2)
      expect(wallet).toMatchObject({ connecting: true, syncing: true, retryCount: 1 })

      await act(async () => {
        second.resolve({ address: ADDRESS })
        await connecting
      })
      expect(wallet).toMatchObject({
        address: ADDRESS,
        connecting: false,
        syncing: false,
        retryCount: 0,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a successful connection usable if the network lookup never answers', async () => {
    vi.useFakeTimers()
    try {
      const lookup = Promise.withResolvers<{ networkPassphrase: string }>()
      const started = Promise.withResolvers<void>()
      kit.getNetwork.mockImplementation(() => {
        started.resolve()
        return lookup.promise
      })
      renderProvider()

      let connecting!: Promise<void>
      await act(async () => {
        connecting = wallet.connect()
        await started.promise
      })
      expect(wallet).toMatchObject({ connected: true, connecting: true, syncing: true })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
        await connecting
        lookup.resolve({ networkPassphrase: PUBLIC })
      })

      expect(wallet).toMatchObject({
        address: ADDRESS,
        connecting: false,
        syncing: false,
        connectionError: null,
        walletNetworkPassphrase: null,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears both busy flags after the last connection attempt times out', async () => {
    vi.useFakeTimers()
    try {
      kit.authModal.mockImplementation(() => new Promise(() => {}))
      renderProvider()

      await act(async () => {
        const connecting = wallet.connect()
        await vi.dynamicImportSettled()
        await vi.advanceTimersByTimeAsync(48_000)
        await connecting
      })

      expect(kit.authModal).toHaveBeenCalledTimes(3)
      expect(wallet).toMatchObject({ connecting: false, syncing: false })
      expect(wallet.connectionError).toContain('Connection timed out')
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears both busy flags if the wallet explicitly cancels', async () => {
    kit.authModal.mockRejectedValue(new Error('Wallet dismissed'))
    renderProvider()

    await act(() => wallet.connect())

    expect(kit.authModal).toHaveBeenCalledTimes(1)
    expect(wallet).toMatchObject({ connecting: false, syncing: false, connectionError: null })
  })

  it('disconnects during a pending wallet prompt without accepting a late result', async () => {
    const prompted = Promise.withResolvers<void>()
    const auth = Promise.withResolvers<{ address: string }>()
    kit.authModal.mockImplementation(() => {
      prompted.resolve()
      return auth.promise
    })
    renderProvider()

    let connecting!: Promise<void>
    await act(async () => {
      connecting = wallet.connect()
      await prompted.promise
    })
    expect(wallet).toMatchObject({ connecting: true, syncing: true })

    await act(async () => {
      wallet.disconnect()
      await connecting
      auth.resolve({ address: ADDRESS })
    })
    expect(wallet).toMatchObject({
      connected: false,
      connecting: false,
      syncing: false,
      connectionError: null,
    })
  })

  it('connects and disconnects a demo wallet even if the storage getter throws', async () => {
    const access = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    try {
      renderProvider()
      act(() => wallet.connectDemo())
      expect(wallet).toMatchObject({ connected: true, isDemo: true })

      await act(async () => {
        wallet.disconnect()
      })
      expect(wallet).toMatchObject({ connected: false, isDemo: false })
    } finally {
      access.mockRestore()
    }
    // Restore the persistent-mode snapshot for the next test.
    act(() => wallet.disconnect())
  })

  it('never flags demo sessions', async () => {
    renderProvider()
    act(() => wallet.connectDemo())
    await expect(wallet.checkWalletNetwork()).resolves.toBe(true)
    expect(kit.getNetwork).not.toHaveBeenCalled()
    expect(screen.getByTestId('mismatch')).toHaveTextContent('false')
  })
})
