'use client'

import { useEffect } from 'react'
import { Helio } from '../brand/Helio'
import { INK, SOLAR } from '../brand/palette'
import { reportError } from '../lib/errorReporting'

/**
 * Root error boundary (#710). Next.js swaps this in for the whole root layout
 * when an error escapes the layout shell itself — `LocaleProvider`, `Providers`,
 * `TopBar` or `Footer` — where `error.tsx` cannot reach. It renders its own
 * `<html>`/`<body>` because the root layout is gone.
 *
 * Deliberately provider-free: it must not depend on anything that might be the
 * crashing thing. Styles are literal (no CSS custom properties or i18n), since
 * the layout that loads the global stylesheet has been replaced.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Heliobond] root error:', error)
    reportError(error, {
      kind: 'root',
      context: error.digest ? { digest: error.digest } : undefined,
    })
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#F3F5F1',
          color: INK,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main
          id="main-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            padding: '64px 32px',
            textAlign: 'center',
          }}
        >
          <div aria-hidden="true" style={{ marginBottom: 32, opacity: 0.75 }}>
            <Helio size={64} motes={12} breathe={false} />
          </div>

          <p
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              letterSpacing: '0.1em',
              color: SOLAR,
              margin: '0 0 12px',
              textTransform: 'uppercase',
            }}
          >
            Something went wrong
          </p>

          <h1
            style={{
              fontWeight: 800,
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: INK,
              margin: '0 0 14px',
            }}
          >
            Heliobond hit an unexpected error
          </h1>

          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: 'rgba(11, 43, 35, 0.6)',
              maxWidth: 440,
              margin: '0 0 8px',
            }}
          >
            The app failed before it could finish loading. Try again, or reload the page to start
            fresh.
          </p>

          {error.digest && (
            <p
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                color: 'rgba(11, 43, 35, 0.4)',
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
                fontWeight: 600,
                fontSize: 15,
                lineHeight: 1,
                borderRadius: 999,
                background: SOLAR,
                color: INK,
                border: '1px solid transparent',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>

            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 44,
                padding: '0 20px',
                fontWeight: 600,
                fontSize: 15,
                lineHeight: 1,
                borderRadius: 999,
                background: 'transparent',
                color: INK,
                border: `1px solid ${INK}`,
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
