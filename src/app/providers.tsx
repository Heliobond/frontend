'use client'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
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
import { TelemetryConsent } from '../components/TelemetryConsent'
import { HorizonHealthProvider, useHorizonHealth } from '../hooks/useHorizonHealth'

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
  const tTimeout = useTranslations('SessionTimeoutExtra')

  const { isWarningOpen, formattedRemaining, extendSession, expireNow } = useSessionTimeout({
    enabled: connected,
    onTimeout: () => {
      disconnect()
      toast({
        tone: 'error',
        title: tTimeout('sessionExpired'),
        message: tTimeout('inactivityDisconnect'),
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

/**
 * Warns that the app is serving cached data: no network, no Stellar node, or a
 * wallet session that dropped on its own. Exported for tests (#595).
 */
export function OfflineBanner() {
  const { connected, lastDisconnectReason } = useWallet()
  const { isOnline } = useHorizonHealth()
  const tShell = useTranslations('Shell')

  // A session the user ended on purpose must not raise a false alarm (#595).
  // An unexpected drop — or a plain network outage — still does.
  const lostSession = !connected && lastDisconnectReason === 'lost'
  const showOffline = !isOnline || lostSession
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
      <strong>{tShell('offline')}</strong> &mdash; {tShell('offlineShowingCached')}
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
      <HorizonHealthProvider>
        <WalletProvider>
          <SessionProvider>
            <TransactionsProvider>
              <ToastProvider>
                <WatchlistProvider>
                  <YieldAlertProvider>
                    <RecurringInvestmentSync />
                    <Analytics />
                    <Telemetry />
                    <TelemetryConsent />
                    <SessionWatcher />
                    <OfflineBanner />
                    {children}
                  </YieldAlertProvider>
                </WatchlistProvider>
              </ToastProvider>
            </TransactionsProvider>
          </SessionProvider>
        </WalletProvider>
      </HorizonHealthProvider>
    </ThemeProvider>
  )
}
