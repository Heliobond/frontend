import Link from 'next/link'
import { Helio } from '../brand/Helio'

/**
 * App-level 404 — unknown routes fall here instead of the framework default.
 * Branded: Helio orb at reduced size, display-type heading, solar accent, back
 * to the landing CTA. Pure Server Component — no client hooks needed.
 */
export default function NotFound() {
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
      <div aria-hidden="true" style={{ marginBottom: 32, opacity: 0.85 }}>
        <Helio size={160} motes={4} breathe={false} />
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
        404
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
        Page not found
      </h1>

      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          lineHeight: 1.6,
          color: 'var(--ink-60)',
          maxWidth: 400,
          margin: '0 0 36px',
        }}
      >
        The route you followed doesn&apos;t exist — it may have moved or never existed.
      </p>

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
          background: 'var(--solar)',
          color: 'var(--ink)',
          textDecoration: 'none',
          border: '1px solid transparent',
          transition: 'background var(--dur-press) var(--ease-out)',
        }}
      >
        Back to Heliobond
      </Link>
    </main>
  )
}
