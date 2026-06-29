import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'

/**
 * Heliobond Badge — a small status marker. Tones derive meaning from an
 * ink-colored label + optional glyph; solar never carries meaning alone.
 * Use `tone="testnet"` for the loud, unmissable network badge.
 */
export type BadgeTone = 'neutral' | 'solar' | 'growth' | 'ember' | 'testnet'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  icon?: ReactNode
  children: ReactNode
}

export function Badge({ tone = 'neutral', icon = null, children, style, ...rest }: BadgeProps) {
  const tones: Record<BadgeTone, CSSProperties> = {
    neutral: {
      background: 'var(--ink-06)',
      color: 'var(--ink)',
      border: '1px solid var(--ink-12)',
    },
    solar: {
      background: 'var(--solar-12)',
      color: 'var(--ink)',
      border: '1px solid var(--solar-24)',
    },
    growth: {
      background: 'var(--growth-12)',
      color: 'var(--growth)',
      border: '1px solid transparent',
    },
    ember: {
      background: 'var(--ember-12)',
      color: 'var(--ember)',
      border: '1px solid transparent',
    },
    testnet: { background: 'var(--solar)', color: 'var(--ink)', border: '1px solid transparent' },
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 24,
        padding: '0 10px',
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        fontSize: 12.5,
        letterSpacing: tone === 'testnet' ? '0.04em' : 0,
        textTransform: tone === 'testnet' ? 'uppercase' : 'none',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        ...tones[tone],
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </span>
  )
}
