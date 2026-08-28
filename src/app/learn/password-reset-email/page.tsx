import { generatePasswordResetEmail } from '@/lib/email/passwordResetTemplate'

export const metadata = {
  title: 'Password Reset Email Demo',
  description:
    'Frontend-only preview of the localized password reset email template with explicit token expiration.',
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h2
        style={{
          margin: '0 0 12px',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--type-h5)',
          color: 'var(--ink)',
        }}
      >
        {label}
      </h2>
      <pre
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--ink-80)',
        }}
      >
        {value}
      </pre>
    </section>
  )
}

export default function PasswordResetEmailPreviewPage() {
  const preview = generatePasswordResetEmail({
    resetUrl: 'https://heliobond.vercel.app/reset-password?token=preview-token',
    expiresInMinutes: 15,
    recipientName: 'Alex Doe',
    requestTimestamp: Date.UTC(2026, 7, 28, 14, 0, 0),
    locale: 'en',
    supportUrl: 'https://heliobond.vercel.app/support',
  })

  return (
    <main id="main-content" style={{ maxWidth: 1024, margin: '0 auto', padding: '64px 32px 96px' }}>
      <p style={{ margin: '0 0 12px', color: 'var(--accent)' }}>Email utility</p>
      <h1
        style={{
          margin: '0 0 16px',
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 4vw, 3.25rem)',
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          color: 'var(--ink)',
        }}
      >
        Password reset email demo
      </h1>
      <p
        style={{
          margin: '0 0 32px',
          maxWidth: 720,
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-body)',
          lineHeight: 1.7,
          color: 'var(--ink-60)',
        }}
      >
        This frontend-only route showcases the generator that would be used by a backend auth
        flow, so the TTL disclaimer, stale-link guidance, and support fallback stay aligned with
        the real template.
      </p>

      <div
        style={{
          display: 'grid',
          gap: 24,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          marginBottom: 24,
        }}
      >
        <section
          style={{
            background: 'linear-gradient(180deg, rgba(11,43,35,0.04), rgba(11,43,35,0.01))',
            border: '1px solid var(--ink-12)',
            borderRadius: 'var(--radius-card)',
            padding: 24,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
            Snapshot
          </h2>
          <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
            <div>
              <dt style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-40)' }}>
                Subject
              </dt>
              <dd style={{ margin: 0, color: 'var(--ink)' }}>{preview.subject}</dd>
            </div>
            <div>
              <dt style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-40)' }}>
                Expires
              </dt>
              <dd style={{ margin: 0, color: 'var(--ink)' }}>{preview.expirationNotice}</dd>
            </div>
          </dl>
        </section>
        <section
          style={{
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: 'var(--radius-card)',
            padding: 24,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>HTML payload</h2>
          <p style={{ margin: 0, lineHeight: 1.7, color: 'rgba(255,255,255,0.8)' }}>
            Generated HTML is available in the email helper. It includes the CTA button, the
            deadline notice, and a safe support link.
          </p>
        </section>
      </div>

      <div style={{ display: 'grid', gap: 24 }}>
        <CodeBlock label="Plaintext preview" value={preview.text} />
        <CodeBlock label="HTML preview" value={preview.html} />
      </div>
    </main>
  )
}
