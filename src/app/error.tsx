'use client'

import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Button } from '../components/Button'
import { Helio } from '../brand/Helio'
import { reportError } from '../lib/errorReporting'
import { useHorizonHealth } from '../hooks/useHorizonHealth'

/** `navigator.onLine`, read through the browser's `online`/`offline` events. */
function subscribeBrowserOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

function getBrowserOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function useBrowserOnline() {
  return useSyncExternalStore(subscribeBrowserOnline, getBrowserOnline, () => true)
}

/**
 * App-level error boundary - runtime errors in any route segment bubble here
 * instead of the framework default crash screen.
 *
 * Must be a Client Component (Next.js requirement for error.tsx).
 * Logs the error to the console and offers a recovery action.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Offline is a connectivity fact, not a guess from the message text. The
  // Horizon poller tracks reachability; `navigator.onLine` covers a hard drop
  // before the poller notices. Generic production error messages ("An error
  // occurred") no longer get mislabelled as a Stellar outage.
  const { isOnline } = useHorizonHealth()
  const browserOnline = useBrowserOnline()
  const isOffline = !isOnline || !browserOnline

  useEffect(() => {
    console.error('[Heliobond] unhandled error:', error)
    reportError(error, {
      kind: 'route',
      context: error.digest ? { digest: error.digest } : undefined,
    })
  }, [error])

  return (
    <main
      id="main-content"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100dvh - 140px)',
        padding: '64px 32px',
        textAlign: 'center',
      }}
    >
      <div aria-hidden="true" style={{ marginBottom: 32, opacity: 0.75 }}>
        <Helio size={64} motes={12} breathe={false} />
      </div>

      <p
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 13,
          letterSpacing: '0.1em',
          color: 'var(--solar)',
          margin: '0 0 12px',
          textTransform: 'uppercase',
        }}
      >
        {isOffline ? "You're offline" : 'Something went wrong'}
      </p>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 'clamp(2rem, 4vw, 3rem)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          margin: '0 0 14px',
        }}
      >
        {isOffline ? 'Lost connection to Stellar' : 'An unexpected error occurred'}
      </h1>

      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          lineHeight: 1.6,
          color: 'var(--ink-60)',
          maxWidth: 440,
          margin: '0 0 8px',
        }}
      >
        {isOffline
          ? "The app couldn't reach the Stellar node. Check your connection or try again. You can still access cached views."
          : 'The application hit an unexpected problem. You can try recovering, or go back to the home page.'}
      </p>

      {error.digest && (
        <p
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 12,
            color: 'var(--ink-40)',
            margin: '0 0 32px',
          }}
        >
          Error ref: {error.digest}
        </p>
      )}
      {!error.digest && <div style={{ marginBottom: 32 }} />}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button onClick={reset}>Try again</Button>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 44,
            padding: '0 20px',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 15,
            lineHeight: 1,
            borderRadius: 'var(--radius-pill)',
            background: 'transparent',
            color: 'var(--ink)',
            border: '1px solid var(--ink)',
            textDecoration: 'none',
            transition: 'background var(--dur-press) var(--ease-out)',
          }}
        >
          Go home
        </Link>
      </div>
    </main>
  )
}
