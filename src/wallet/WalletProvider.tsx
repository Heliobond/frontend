'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { STELLAR_NETWORK_UPPERCASE, passphraseForNetwork } from '../config/network'
import { NetworkMismatchError, isNetworkMismatch } from './networkGuard'
import type { Networks } from '@creit.tech/stellar-wallets-kit/types'

interface WalletContextValue {
  address: string | null
  connected: boolean
  connecting: boolean
  isDemo: boolean
  restoring: boolean
  connectionError: string | null
  retryCount: number
  connect: () => Promise<void>
  connectDemo: () => void
  disconnect: () => void
  retry: () => Promise<void>
  /** Sign a transaction XDR. `passphrase` overrides the app network (SEP-10 challenges). */
  sign: (xdr: string, passphrase?: string) => Promise<string>
  /** Sign an arbitrary message (SEP-53 / SEP-43 signMessage) for wallet sign-in (#603). */
  signMessage: (message: string) => Promise<string>
  network: 'PUBLIC' | 'TESTNET'
  setNetwork: (network: 'PUBLIC' | 'TESTNET') => void
  /** Passphrase the connected wallet reports, or null if unknown / not connected. */
  walletNetworkPassphrase: string | null
  /** True when the wallet is on a different network than the app (#611). */
  networkMismatch: boolean
  /** Re-read the wallet's network; resolves true when it matches the app. */
  checkWalletNetwork: () => Promise<boolean>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within <WalletProvider>')
  return ctx
}

export function shortAddress(address: string, lead = 4, tail = 3): string {
  if (address.length <= lead + tail + 1) return address
  const suffix = tail > 0 ? address.slice(-tail) : ''
  return `${address.slice(0, lead)}…${suffix}`
}

const DEMO_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
const CONNECT_TIMEOUT_MS = 15000
const MAX_AUTO_RETRIES = 2

const getInitialNetwork = (): 'PUBLIC' | 'TESTNET' => STELLAR_NETWORK_UPPERCASE

export function WalletProvider({ children }: {children: ReactNode}) {
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [network, setNetworkState] = useState<'PUBLIC' | 'TESTNET'>(getInitialNetwork)
  const initedNetworkRef = useRef<'PUBLIC' | 'TESTNET' | null>(null)
  const [walletNetworkPassphrase, setWalletNetworkPassphrase] = useState<string | null>(null)
  const appPassphrase = passphraseForNetwork(network)

  const persist = useCallback((addr: string, walletId: string) => {
    try {
      localStorage.setItem('hb-address', addr)
      localStorage.setItem('hb-wallet', walletId)
    } catch {
      /* ignore */
    }
  }, [])

  const setNetwork = useCallback((n: 'PUBLIC' | 'TESTNET') => {
    setNetworkState(n)
    try {
      localStorage.setItem('hb-network', n)
    } catch {
      /* ignore */
    }
  }, [])

  // Load saved network from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hb-network')
      if (saved === 'PUBLIC' || saved === 'TESTNET') {
        setNetworkState(saved)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const ensureInit = useCallback(async () => {
    if (initedNetworkRef.current === network) return
    const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
    const { defaultModules } = await import('@creit.tech/stellar-wallets-kit/modules/utils')
    const modules = defaultModules()
    // e2e builds only: a keypair-backed module so Playwright can sign without
    // a browser extension (#607). Never enabled on mainnet.
    if (process.env.NEXT_PUBLIC_E2E_TEST_WALLET === 'true' && STELLAR_NETWORK_UPPERCASE !== 'PUBLIC') {
      const { E2ETestWalletModule } = await import('./e2eTestWallet')
      modules.unshift(new E2ETestWalletModule())
    }
    StellarWalletsKit.init({
      modules,
      network: appPassphrase as Networks,
    })
    initedNetworkRef.current = network
  }, [network, appPassphrase])

  /** Ask the wallet which network it is on. null when the wallet can't say. */
  const readWalletNetwork = useCallback(async (): Promise<string | null> => {
    try {
      await ensureInit()
      const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
      const { networkPassphrase } = await StellarWalletsKit.getNetwork()
      const passphrase = networkPassphrase || null
      setWalletNetworkPassphrase(passphrase)
      return passphrase
    } catch {
      // Not every wallet exposes its network; don't block on it.
      setWalletNetworkPassphrase(null)
      return null
    }
  }, [ensureInit])

  const checkWalletNetwork = useCallback(async (): Promise<boolean> => {
    if (isDemo || !address) return true
    const walletPassphrase = await readWalletNetwork()
    return !isNetworkMismatch(walletPassphrase, appPassphrase)
  }, [isDemo, address, readWalletNetwork, appPassphrase])

  useEffect(() => {
    let saved: string | null = null
    let savedWallet: string | null = null
    try {
      saved = localStorage.getItem('hb-address')
      savedWallet = localStorage.getItem('hb-wallet')
    } catch {
      /* ignore */
    }
    if (!saved) {
      setRestoring(false)
      return
    }
    setAddress(saved)
    setIsDemo(savedWallet === 'demo')
    setRestoring(false)

    if (savedWallet && savedWallet !== 'demo') {
      void (async () => {
        try {
          await ensureInit()
          const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
          StellarWalletsKit.setWallet(savedWallet)
          await readWalletNetwork()
        } catch {
          /* the wallet may be uninstalled now — the address still shows */
        }
      })()
    }
  }, [ensureInit, readWalletNetwork])

  const connectWithRetry = useCallback(async (attempt = 0): Promise<void> => {
    setConnecting(true)
    setConnectionError(null)
    try {
      await ensureInit()
      const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), CONNECT_TIMEOUT_MS)
      )
      const authPromise = StellarWalletsKit.authModal() as Promise<{ address: string }>
      const { address: addr } = await Promise.race([authPromise, timeoutPromise])
      let walletId = 'wallet'
      try {
        walletId = StellarWalletsKit.selectedModule?.productId ?? 'wallet'
      } catch {
        /* fallback */
      }
      setAddress(addr)
      setIsDemo(false)
      setRetryCount(0)
      persist(addr, walletId)
      await readWalletNetwork()
    } catch (e) {
      const isTimeout = e instanceof Error && e.message === 'timeout'
      const isCancelled = e instanceof Error && /dismiss|cancel|closed/i.test(e.message)
      if (isCancelled) {
        return
      }
      if (isTimeout && attempt < MAX_AUTO_RETRIES) {
        setRetryCount(attempt + 1)
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
        return connectWithRetry(attempt + 1)
      }
      setConnectionError(
        isTimeout
          ? 'Connection timed out — please check your network and try again.'
          : 'Could not connect to wallet — please try again.'
      )
    } finally {
      setConnecting(false)
    }
  }, [ensureInit, persist, readWalletNetwork])

  const connect = useCallback(async () => {
    setRetryCount(0)
    await connectWithRetry(0)
  }, [connectWithRetry])

  const retry = useCallback(async () => {
    setRetryCount(0)
    setConnectionError(null)
    await connectWithRetry(0)
  }, [connectWithRetry])

  const connectDemo = useCallback(() => {
    setAddress(DEMO_ADDRESS)
    setIsDemo(true)
    setConnectionError(null)
    persist(DEMO_ADDRESS, 'demo')
  }, [persist])

  const sign = useCallback(
    async (xdr: string, passphrase?: string): Promise<string> => {
      if (isDemo) throw new Error('demo')
      await ensureInit()
      const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
      // A sign-in challenge may name its own network; only app transactions are
      // guarded against a wallet/app network mismatch.
      if (!passphrase) {
        // Block before the wallet prompt: a mismatched network can only fail (#611).
        const walletPassphrase = await readWalletNetwork()
        if (isNetworkMismatch(walletPassphrase, appPassphrase)) {
          throw new NetworkMismatchError(walletPassphrase!, appPassphrase)
        }
      }
      const result = await StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: passphrase ?? appPassphrase,
        address: address ?? undefined,
      })
      return result.signedTxXdr
    },
    [isDemo, ensureInit, address, appPassphrase, readWalletNetwork],
  )

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (isDemo) throw new Error('demo')
      await ensureInit()
      const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
      const result = await StellarWalletsKit.signMessage(message, {
        networkPassphrase: appPassphrase,
        address: address ?? undefined,
      })
      return result.signedMessage
    },
    [isDemo, ensureInit, address, appPassphrase],
  )

  const disconnect = useCallback(() => {
    setAddress(null)
    setIsDemo(false)
    setConnectionError(null)
    setRetryCount(0)
    setWalletNetworkPassphrase(null)
    try {
      localStorage.removeItem('hb-address')
      localStorage.removeItem('hb-wallet')
    } catch {
      /* ignore */
    }
    void import('@creit.tech/stellar-wallets-kit')
      .then(({ StellarWalletsKit }) => StellarWalletsKit.disconnect())
      .catch(() => {})
  }, [])

  return (
    <WalletContext.Provider
      value={{
        address,
        connected: address !== null,
        connecting,
        isDemo,
        restoring,
        connectionError,
        retryCount,
        connect,
        connectDemo,
        disconnect,
        retry,
        sign,
        signMessage,
        network,
        setNetwork,
        walletNetworkPassphrase,
        networkMismatch:
          !isDemo && address !== null && isNetworkMismatch(walletNetworkPassphrase, appPassphrase),
        checkWalletNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
