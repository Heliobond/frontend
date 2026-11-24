'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { STELLAR_NETWORK_UPPERCASE, passphraseForNetwork } from '../config/network'
import { NetworkMismatchError, isNetworkMismatch } from './networkGuard'
import {
  DEMO_WALLET_ID,
  clearSession,
  clearUserData,
  getServerSession,
  getSession,
  saveNetwork,
  saveSession,
  subscribeSession,
  UNREAD_SESSION,
  type AppNetwork,
} from './session'
import type { Networks } from '@creit.tech/stellar-wallets-kit/types'

/**
 * Why the wallet is no longer connected. `'user'` means the user asked for it
 * (Disconnect button, or session expiry) and the UI should stay quiet; anything
 * else means the session dropped on its own and callers may want to warn (#595).
 */
export type DisconnectReason = 'user' | 'lost'

interface WalletContextValue {
  address: string | null
  connected: boolean
  connecting: boolean
  /** True when the wallet is initializing, connecting, or syncing with the Stellar network (#473). */
  syncing: boolean
  isDemo: boolean
  restoring: boolean
  connectionError: string | null
  retryCount: number
  connect: () => Promise<void>
  connectDemo: () => void
  disconnect: (reason?: DisconnectReason) => void
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
  /** Why the wallet disconnected, or null while connected (#595). */
  lastDisconnectReason: DisconnectReason | null
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

export {
  isValidStellarAddress,
  validateStellarAddress,
  isValidPublicKey,
  validatePublicKey,
  type AddressValidationResult,
} from '../lib/stellarPayment'

// Valid Ed25519 public key so demo sessions can also drive on-chain reads
// (simulation source); mirrors SIMULATION_SOURCE_ADDRESS in registry.ts (#625).
const DEMO_ADDRESS = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
const CONNECT_TIMEOUT_MS = 15000
const MAX_AUTO_RETRIES = 2

const getInitialNetwork = (): 'PUBLIC' | 'TESTNET' => STELLAR_NETWORK_UPPERCASE

export function WalletProvider({ children }: { children: ReactNode }) {
  // The persisted session is read through an external store rather than an
  // effect: the first client render already matches it, so there is no
  // hydration mismatch and no cascading render (#595, #598).
  const stored = useSyncExternalStore(subscribeSession, getSession, getServerSession)

  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [walletNetworkPassphrase, setWalletNetworkPassphrase] = useState<string | null>(null)
  const [lastDisconnectReason, setLastDisconnectReason] = useState<DisconnectReason | null>(null)
  const initedNetworkRef = useRef<AppNetwork | null>(null)
  const connection = useRef<AbortController | null>(null)
  const attachedWallet = useRef<{ address: string; id: string; network: AppNetwork } | null>(null)

  useEffect(() => () => connection.current?.abort(), [])
  const appPassphrase = passphraseForNetwork(stored.network ?? getInitialNetwork())

  const address = stored.address || null
  const isDemo = stored.walletId === DEMO_WALLET_ID
  // Storage is only readable in the browser, so the server render and the first
  // client render both see the unread snapshot. `restoring` stays true until
  // the store has actually read it, which is what stops `RequireWallet` from
  // bouncing a connected user to /connect on every page load (#595).
  const restoring = stored === UNREAD_SESSION
  const network: AppNetwork = stored.network ?? getInitialNetwork()

  const persist = useCallback(
    (addr: string, walletId: string) => {
      if (stored.address && stored.address !== addr) clearUserData()
      saveSession(addr, walletId)
    },
    [stored.address],
  )

  const setNetwork = useCallback((n: AppNetwork) => {
    saveNetwork(n)
  }, [])

  const ensureInit = useCallback(async () => {
    if (initedNetworkRef.current === network) return
    const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
    const { defaultModules } = await import('@creit.tech/stellar-wallets-kit/modules/utils')
    const modules = defaultModules()
    // e2e builds only: a keypair-backed module so Playwright can sign without
    // a browser extension (#607). Never enabled on mainnet.
    if (
      process.env.NEXT_PUBLIC_E2E_TEST_WALLET === 'true' &&
      STELLAR_NETWORK_UPPERCASE !== 'PUBLIC'
    ) {
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
  const readWalletNetwork = useCallback(
    async (signal?: AbortSignal): Promise<string | null> => {
      try {
        await ensureInit()
        const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
        const { networkPassphrase } = await StellarWalletsKit.getNetwork()
        const passphrase = networkPassphrase || null
        if (!signal?.aborted) setWalletNetworkPassphrase(passphrase)
        return passphrase
      } catch {
        // Not every wallet exposes its network; don't block on it.
        if (!signal?.aborted) setWalletNetworkPassphrase(null)
        return null
      }
    },
    [ensureInit],
  )

  const checkWalletNetwork = useCallback(async (): Promise<boolean> => {
    if (isDemo || !address) return true
    setSyncing(true)
    try {
      const walletPassphrase = await readWalletNetwork()
      return !isNetworkMismatch(walletPassphrase, appPassphrase)
    } finally {
      setSyncing(false)
    }
  }, [isDemo, address, readWalletNetwork, appPassphrase])

  // Re-attach the wallet module for a restored non-demo session. The address
  // itself is already rendered from the store, so this only refreshes the
  // network readout; a failure here must not clear the restored session.
  const restoredWallet = stored.walletId
  useEffect(() => {
    if (!address || !restoredWallet || restoredWallet === DEMO_WALLET_ID) return
    const attached = attachedWallet.current
    if (
      attached?.address === address &&
      attached.id === restoredWallet &&
      attached.network === network
    )
      return
    let cancelled = false
    void (async () => {
      setSyncing(true)
      try {
        await ensureInit()
        const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
        StellarWalletsKit.setWallet(restoredWallet)
        await readWalletNetwork()
      } catch {
        /* the wallet may be uninstalled now — the address still shows */
      } finally {
        if (!cancelled) setSyncing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address, restoredWallet, network, ensureInit, readWalletNetwork])

  const connect = useCallback(async (): Promise<void> => {
    if (connection.current) return
    const controller = new AbortController()
    const { signal } = controller
    connection.current = controller
    setConnecting(true)
    setRetryCount(0)
    setConnectionError(null)

    const cancelled = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([ensureInit(), cancelled])
      const { StellarWalletsKit } = await Promise.race([
        import('@creit.tech/stellar-wallets-kit'),
        cancelled,
      ])
      for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), CONNECT_TIMEOUT_MS)
        })
        let addr: string
        try {
          const auth = StellarWalletsKit.authModal() as Promise<{ address: string }>
          const result = await Promise.race([auth, timeout, cancelled])
          addr = result.address
        } catch (error) {
          clearTimeout(timer)
          if (signal.aborted || !(error instanceof Error && error.message === 'timeout')) {
            throw error
          }
          if (attempt === MAX_AUTO_RETRIES) throw error
          setRetryCount(attempt + 1)
          const delay = new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 1000 * 2 ** attempt)
          })
          await Promise.race([delay, cancelled])
          continue
        } finally {
          clearTimeout(timer)
        }

        let walletId = 'wallet'
        try {
          walletId = StellarWalletsKit.selectedModule?.productId ?? walletId
        } catch {
          /* fallback */
        }
        setLastDisconnectReason(null)
        setRetryCount(0)
        setWalletNetworkPassphrase(null)
        attachedWallet.current = { address: addr, id: walletId, network }
        persist(addr, walletId)
        // Some wallets never answer getNetwork. An accepted connection can still be used.
        timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS)
        await Promise.race([readWalletNetwork(signal), cancelled])
        return
      }
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && /dismiss|cancel|closed/i.test(error.message))
      ) {
        setRetryCount(0)
        return
      }
      setConnectionError(
        error instanceof Error && error.message === 'timeout'
          ? 'Connection timed out — please check your network and try again.'
          : 'Could not connect to wallet — please try again.',
      )
    } finally {
      clearTimeout(timer)
      connection.current = null
      setConnecting(false)
    }
  }, [ensureInit, network, persist, readWalletNetwork])

  const connectDemo = useCallback(() => {
    connection.current?.abort()
    attachedWallet.current = null
    setSyncing(false)
    setLastDisconnectReason(null)
    setConnectionError(null)
    persist(DEMO_ADDRESS, DEMO_WALLET_ID)
  }, [persist])

  const sign = useCallback(
    async (xdr: string, passphrase?: string): Promise<string> => {
      if (isDemo) throw new Error('demo')
      setSyncing(true)
      try {
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
      } finally {
        setSyncing(false)
      }
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

  /**
   * Ends the session. `reason` defaults to `'user'` because every current caller
   * (Disconnect button, admin, session expiry) is deliberate; the offline banner
   * uses this to stay quiet for those and warn only for unexpected drops (#595).
   */
  const disconnect = useCallback((reason: DisconnectReason = 'user') => {
    connection.current?.abort()
    attachedWallet.current = null
    setSyncing(false)
    setLastDisconnectReason(reason)
    setConnectionError(null)
    setRetryCount(0)
    setWalletNetworkPassphrase(null)
    clearSession()
    void import('@creit.tech/stellar-wallets-kit')
      .then(({ StellarWalletsKit }) => StellarWalletsKit.disconnect())
      .catch(() => {})
  }, [])

  const networkMismatch =
    !isDemo && address !== null && isNetworkMismatch(walletNetworkPassphrase, appPassphrase)

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      connected: address !== null,
      connecting,
      syncing: connecting || syncing,
      isDemo,
      restoring,
      connectionError,
      retryCount,
      connect,
      connectDemo,
      disconnect,
      retry: connect,
      sign,
      signMessage,
      network,
      setNetwork,
      walletNetworkPassphrase,
      networkMismatch,
      checkWalletNetwork,
      lastDisconnectReason,
    }),
    [
      address,
      connecting,
      syncing,
      isDemo,
      restoring,
      connectionError,
      retryCount,
      connect,
      connectDemo,
      disconnect,
      sign,
      signMessage,
      network,
      setNetwork,
      walletNetworkPassphrase,
      networkMismatch,
      checkWalletNetwork,
      lastDisconnectReason,
    ],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
