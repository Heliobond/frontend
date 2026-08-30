'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from '../theme/ThemeProvider'
import { WalletProvider, useWallet } from '../wallet/WalletProvider'
import { ToastProvider, SessionTimeoutModal, useToast } from '../components'
import { useSessionTimeout } from '../hooks/useSessionTimeout'

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

/**
 * Client providers that must persist across route changes: theme (After Sunset
 * dark mode) and wallet (Stellar connection). LocaleProvider lives one level up
 * so it can be seeded with the server-resolved locale and messages.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <WalletProvider>
        <ToastProvider>
          <SessionWatcher />
          {children}
        </ToastProvider>
      </WalletProvider>
    </ThemeProvider>
  )
}
