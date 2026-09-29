'use client'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { ThemeProvider } from '../theme/ThemeProvider'
import { WalletProvider, useWallet } from '../wallet/WalletProvider'
import { TransactionsProvider } from '../wallet/TransactionsProvider'
import { ToastProvider, SessionTimeoutModal, useToast } from '../components'
import { SessionProvider } from '../session/SessionProvider'
import { RecurringInvestmentSync } from '../session/RecurringInvestmentSync'
import { WatchlistProvider } from '../watchlist/WatchlistProvider'
import { YieldAlertProvider } from '../alerts/YieldAlertProvider'
import { useSessionTimeout } from '../hooks/useSessionTimeout'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import { track } from '../lib/analytics'
import { installGlobalErrorHandlers, reportWebVitals } from '../lib/errorReporting'
import { HORIZON_URL } from '../config/network'

function Analytics() {
  const pathname = usePathname()

  useEffect(() => {
    void track('page_view', { path: pathname })
  }, [pathname])

  return null
}

/** Collects web-vitals (LCP, INP, CLS…) and uncaught errors for telemetry (#609). */
function Telemetry() {
  useReportWebVitals(reportWebVitals)
  useEffect(() => installGlobalErrorHandlers(), [])
  return null
}

function SessionWatcher() {
  const { connected, disconnect } = useWallet()
  const { toast } = useToast()

  const { isWarningOpen, formattedRemaining, extendSession, expireNow } = useSessionTimeout({
    enabled: connected,
    onTimeout: () => {
      disconnect()
      toast({
        tone: 'error',
        title: 'Session expired',
        message: 'You have been disconnected due to inactivity.',
      })
    },
  })

  return (
    <SessionTimeoutModal
      open={isWarningOpen}
      formattedTime={formattedRemaining}
      onExtend={extendSession}
      onLogout={expireNow}
    />
  )
}

function OfflineBanner() {
  const { connected } = useWallet()
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [wasConnected, setWasConnected] = useState(() => {
    try {
      return localStorage.getItem('stellar-wallet-connected') === 'true'
    } catch {
      return false
    }
  })
  const [stellarReachable, setStellarReachable] = useState(true)

  useEffect(() => {
    let active = true
    let currentController: AbortController | null = null

    const checkStellar = async () => {
      // Abort any in-flight request to prevent stale responses/hangs.
      if (currentController) {
        currentController.abort()
      }
      const controller = new AbortController()
      currentController = controller
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      try {
        const response = await fetch(`${HORIZON_URL}/`, { signal: controller.signal })
        if (!response.ok) throw new Error('Stellar node unreachable')
        if (active && currentController === controller) setStellarReachable(true)
      } catch {
        if (active && currentController === controller) setStellarReachable(false)
      } finally {
        clearTimeout(timeoutId)
        if (currentController === controller) currentController = null
      }
    }

    const handleOnline = () => {
      setIsOnline(true)
      checkStellar()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    checkStellar()
    const interval = setInterval(checkStellar, 30000)

    return () => {
      active = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
      // Abort any outstanding request on unmount.
      currentController?.abort()
    }
  }, [])

  useEffect(() => {
    if (connected) {
      try {
        localStorage.setItem('stellar-wallet-connected', 'true')
      } catch {
        // ignore storage errors
      }
      setWasConnected(true)
    }
  }, [connected])

  const showOffline = !isOnline || (wasConnected && !connected) || !stellarReachable
  if (!showOffline) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '1rem',
        backgroundColor: '#f97316', // orange
        color: 'white',
        textAlign: 'center',
        zIndex: 9999,
        fontSize: '0.875rem',
      }}
    >
      <strong>Offline</strong> &mdash; Showing cached data. Attempting to reconnect...
    </div>
  )
}

/**
 * Client providers that must persist across route changes: theme (After Sunset
 * dark mode) and wallet (Stellar connection). LocaleProvider lives one level
 * up so it can be seeded with the server-resolved locale and messages.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <WalletProvider>
        <SessionProvider>
          <TransactionsProvider>
            <ToastProvider>
              <WatchlistProvider>
                <YieldAlertProvider>
                  <RecurringInvestmentSync />
                  <Analytics />
                  <Telemetry />
                  <SessionWatcher />
                  <OfflineBanner />
                  {children}
                </YieldAlertProvider>
              </WatchlistProvider>
            </ToastProvider>
          </TransactionsProvider>
        </SessionProvider>
      </WalletProvider>
    </ThemeProvider>
  )
}
