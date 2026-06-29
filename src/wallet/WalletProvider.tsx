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

/**
 * Wallet state for Heliobond. Wraps the Stellar Wallets Kit (Freighter, xBull,
 * Albedo, Lobstr, Hana, WalletConnect, …) for a REAL connection on testnet. The
 * kit is browser-only and heavy, so it's dynamically imported on first use.
 *
 * `connectDemo()` sets a placeholder address so the click-through still works
 * end-to-end without a wallet extension installed (the app is also a demo).
 * Signing for deposit/withdraw will go through `StellarWalletsKit.signTransaction`
 * once the vault contract is deployed — see src/wallet/vault.ts.
 */
interface WalletContextValue {
  address: string | null
  connected: boolean
  connecting: boolean
  isDemo: boolean
  connect: () => Promise<void>
  connectDemo: () => void
  disconnect: () => void
  /** Sign an XDR envelope via the connected wallet. Throws in demo mode. */
  sign: (xdr: string) => Promise<string>
  network: 'TESTNET'
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within <WalletProvider>')
  return ctx
}

/** Stellar address / hash, truncated in the middle (never the end). */
export function shortAddress(address: string, lead = 4, tail = 3): string {
  return address.length > lead + tail + 1
    ? `${address.slice(0, lead)}…${address.slice(-tail)}`
    : address
}

const DEMO_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

export function WalletProvider({ children }: { children: ReactNode }) {
  const initedRef = useRef(false)
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [isDemo, setIsDemo] = useState(false)

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

  // Restore a previous session (address persisted client-side).
  useEffect(() => {
    let saved: string | null = null
    let savedWallet: string | null = null
    try {
      saved = localStorage.getItem('hb-address')
      savedWallet = localStorage.getItem('hb-wallet')
    } catch {
      /* ignore */
    }
    if (!saved) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddress(saved)
    setIsDemo(savedWallet === 'demo')

    // Re-select the real wallet module in the kit so signing works after a
    // reload (the demo session needs nothing).
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

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      await ensureInit()
      const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit')
      // authModal opens the picker, sets the chosen wallet, and returns its address.
      const { address: addr } = await StellarWalletsKit.authModal()
      // Persist the real selected module id so the session can be restored to sign later.
      let walletId = 'wallet'
      try {
        walletId = StellarWalletsKit.selectedModule?.productId ?? 'wallet'
      } catch {
        /* selectedModule may be unavailable — fall back to a generic marker */
      }
      setAddress(addr)
      setIsDemo(false)
      persist(addr, walletId)
    } catch {
      // User dismissed the modal or no wallet is available — stay disconnected, quietly.
    } finally {
      setConnecting(false)
    }
  }, [ensureInit, persist])

  const connectDemo = useCallback(() => {
    setAddress(DEMO_ADDRESS)
    setIsDemo(true)
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
    try {
      localStorage.removeItem('hb-address')
      localStorage.removeItem('hb-wallet')
    } catch {
      /* ignore */
    }
    // Always clear the kit's own session/storage too (idempotent if never inited).
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
        connect,
        connectDemo,
        disconnect,
        sign,
        network: 'TESTNET',
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
