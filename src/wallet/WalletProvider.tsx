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
  sign: (xdr: string) => Promise<string>
  network: 'TESTNET'
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const initedRef = useRef(false)
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const persist = useCallback((addr: string, walletId: string) => {
    try {
      localStorage.setItem('hb-address', addr)
      localStorage.setItem('hb-wallet', walletId)
    } catch {
      /* ignore */
    }
  }, [])

  const ensureInit = useCallback(async () => {
    if (initedRef.current) return
    const { StellarWalletsKit, Networks } = await import('@creit.tech/stellar-wallets-kit')
    const { defaultModules } = await import('@creit.tech/stellar-wallets-kit/modules/utils')
    StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET })
    initedRef.current = true
  }, [])

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
        } catch {
          /* the wallet may be uninstalled now — the address still shows */
        }
      })()
    }
  }, [ensureInit])

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
  }, [ensureInit, persist])

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
    async (xdr: string): Promise<string> => {
      if (isDemo) throw new Error('demo')
      await ensureInit()
      const { StellarWalletsKit, Networks } = await import('@creit.tech/stellar-wallets-kit')
      const result = await StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: Networks.TESTNET,
        address: address ?? undefined,
      })
      return result.signedTxXdr
    },
    [isDemo, ensureInit, address],
  )

  const disconnect = useCallback(() => {
    setAddress(null)
    setIsDemo(false)
    setConnectionError(null)
    setRetryCount(0)
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
        network: 'TESTNET',
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
