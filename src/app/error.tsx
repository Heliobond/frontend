'use client'

import { useEffect } from 'react'
import { Helio } from '../brand/Helio'

/**
 * App-level error boundary — runtime errors in any route segment bubble here
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
  useEffect(() => {
    // In production wire this to your error-reporting service (e.g. Sentry).
    console.error('[Heliobond] unhandled error:', error)
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
        <Helio size={160} motes={3} breathe={false} />
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
        Something went wrong
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
        An unexpected error occurred
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
        The application hit an unexpected problem. You can try recovering, or go
        back to the home page.
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
        <button
          type="button"
          onClick={reset}
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
            background: 'var(--solar)',
            color: 'var(--ink)',
            border: '1px solid transparent',
            cursor: 'pointer',
            transition: 'background var(--dur-press) var(--ease-out)',
          }}
        >
          Try again
        </button>

        <a
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
        </a>
      </div>
    </main>
  )
}
