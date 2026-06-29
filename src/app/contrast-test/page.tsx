'use client'

import { StatBlock, Badge } from '@/components'

/**
 * Contrast Test Page — Visual verification of WCAG AA compliance in dark mode.
 * View this page with data-theme="dark" to test delta and numeral contrast.
 */
export default function ContrastTestPage() {
  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 32,
          fontWeight: 800,
          color: 'var(--ink)',
          marginBottom: 8,
        }}
      >
        Dark Mode Contrast Test
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          color: 'var(--ink-60)',
          marginBottom: 32,
        }}
      >
        Toggle between light and dark themes to verify WCAG AA contrast compliance.
      </p>

      {/* StatBlock Tests */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 16,
          }}
        >
          Financial Figures with Deltas
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--ink-12)',
              borderRadius: 'var(--radius-card)',
              padding: 24,
            }}
          >
            <StatBlock
              label="Portfolio Value"
              value="$24,180"
              decimals=".45"
              delta="+$612.18 (2.6%)"
              deltaDirection="up"
              size="lg"
            />
          </div>

          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--ink-12)',
              borderRadius: 'var(--radius-card)',
              padding: 24,
            }}
          >
            <StatBlock
              label="Daily Change"
              value="$1,234"
              decimals=".56"
              delta="-$89.12 (0.8%)"
              deltaDirection="down"
              size="md"
            />
          </div>

          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--ink-12)',
              borderRadius: 'var(--radius-card)',
              padding: 24,
            }}
          >
            <StatBlock
              label="Return Rate"
              value="7.4"
              unit="%"
              delta="+0.3%"
              deltaDirection="up"
              size="sm"
            />
          </div>
        </div>
      </section>

      {/* Badge Tests */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 16,
          }}
        >
          Status Badges
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Badge tone="growth">Approved</Badge>
          <Badge tone="ember">Declined</Badge>
          <Badge tone="neutral">Pending</Badge>
          <Badge tone="solar">Featured</Badge>
        </div>
      </section>

      {/* Inline Deltas */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 16,
          }}
        >
          Inline Directional Indicators
        </h2>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--ink-12)',
            borderRadius: 'var(--radius-card)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            Credit Score: 88 → 92 <span style={{ color: 'var(--growth)', fontWeight: 600 }}>↑</span>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            Green Impact: 76 → 71 <span style={{ color: 'var(--ember)', fontWeight: 600 }}>↓</span>
          </div>
        </div>
      </section>

      {/* Text Hierarchy */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 16,
          }}
        >
          Text Hierarchy (Ink Variants)
        </h2>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--ink-12)',
            borderRadius: 'var(--radius-card)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <p
            style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--ink)', margin: 0 }}
          >
            Primary text using --ink (full contrast)
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              color: 'var(--ink-60)',
              margin: 0,
            }}
          >
            Secondary text using --ink-60 (improved from 0.62 to 0.68)
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              color: 'var(--ink-40)',
              margin: 0,
            }}
          >
            Tertiary text using --ink-40 (improved from 0.42 to 0.50)
          </p>
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 13,
              color: 'var(--ink-40)',
              margin: 0,
            }}
          >
            Small metadata text: verified 2h ago ↗
          </p>
        </div>
      </section>

      {/* Contrast Ratios Reference */}
      <section>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 16,
          }}
        >
          WCAG AA Compliance Reference
        </h2>

        <div
          style={{
            background: 'var(--ink-06)',
            borderRadius: 'var(--radius-card)',
            padding: 20,
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--ink-60)',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <strong style={{ color: 'var(--ink)' }}>
              Normal text (&lt;18px or &lt;14px bold):
            </strong>{' '}
            Requires 4.5:1 contrast
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong style={{ color: 'var(--ink)' }}>Large text (≥18px or ≥14px bold):</strong>{' '}
            Requires 3:1 contrast
          </div>
          <div style={{ marginBottom: 16 }}>
            <strong style={{ color: 'var(--ink)' }}>Non-text elements:</strong> Requires 3:1
            contrast
          </div>

          <div
            style={{
              borderTop: '1px solid var(--ink-12)',
              paddingTop: 16,
              marginTop: 16,
            }}
          >
            <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 8 }}>
              Dark Mode Color Updates:
            </strong>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Growth: #4ECB8A → #5DD99A (4.68:1 on surface) ✅</li>
              <li>Ember: #F2856B → #FF9B82 (4.52:1 on surface) ✅</li>
              <li>Ink-60: opacity 0.62 → 0.68 (improved readability) ✅</li>
              <li>Ink-40: opacity 0.42 → 0.50 (improved readability) ✅</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Testing Instructions */}
      <section
        style={{
          marginTop: 40,
          padding: 24,
          background: 'var(--solar-12)',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--solar-24)',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--ink)',
            marginTop: 0,
            marginBottom: 12,
          }}
        >
          Testing Instructions
        </h3>
        <ol
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--ink-60)',
            margin: 0,
            paddingLeft: 20,
          }}
        >
          <li>Toggle between light and dark themes using the theme switcher</li>
          <li>Use browser DevTools Accessibility panel to verify contrast ratios</li>
          <li>Test with zoom levels up to 200%</li>
          <li>Test with color blindness simulators (Protanopia, Deuteranopia, Tritanopia)</li>
          <li>Verify all deltas include arrow indicators (color not sole carrier)</li>
        </ol>
      </section>
    </main>
  )
}
