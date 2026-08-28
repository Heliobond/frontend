'use client'

/**
 * Visual check for Issue #351:
 * the Forgot Password link must remain readable on dark backgrounds.
 */
export default function ContrastTestPage() {
  return (
    <main id="main-content" style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--type-h1)',
          fontWeight: 800,
          color: 'var(--ink)',
          marginBottom: 8,
        }}
      >
        Forgot Password Link Contrast
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-body)',
          color: 'var(--ink-60)',
          marginBottom: 32,
          lineHeight: 1.6,
        }}
      >
        This page shows the link treatment used to fix the WCAG AA contrast issue on dark
        backgrounds.
      </p>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--ink-12)',
          borderRadius: 'var(--radius-card)',
          padding: 24,
          marginBottom: 20,
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
          Light Surface
        </h2>
        <a href="#forgot" className="hb-textlink" style={{ fontSize: 'var(--type-body)' }}>
          Forgot Password?
        </a>
      </section>

      <section
        style={{
          background: 'var(--canvas)',
          border: '1px solid var(--ink-12)',
          borderRadius: 'var(--radius-card)',
          padding: 24,
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
          Dark Background
        </h2>
        <a href="#forgot" className="hb-textlink" style={{ fontSize: 'var(--type-body)' }}>
          Forgot Password?
        </a>
        <p
          style={{
            margin: '16px 0 0',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-small)',
            lineHeight: 1.6,
            color: 'var(--ink-60)',
          }}
        >
          The link should remain at or above 4.5:1 contrast, with underline and focus ring kept
          visible.
        </p>
      </section>
    </main>
  )
}
