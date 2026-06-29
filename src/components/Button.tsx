import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'

/**
 * Heliobond Button — primary (pill, solar fill), secondary (ink outline), ghost.
 * Text on solar is ink (AAA). Active scales to 0.97. Disabled carries a reason
 * surfaced in a tooltip — never a bare greyed control.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Plain-language reason shown in a tooltip when disabled. */
  reason?: string
  icon?: ReactNode
  iconRight?: ReactNode
  type?: 'button' | 'submit' | 'reset'
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  reason,
  icon = null,
  iconRight = null,
  type = 'button',
  onClick,
  children,
  style,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false)
  const [active, setActive] = useState(false)

  const sizes: Record<ButtonSize, { padding: string; height: number; font: number }> = {
    sm: { padding: '0 14px', height: 36, font: 14 },
    md: { padding: '0 20px', height: 44, font: 15 },
    lg: { padding: '0 28px', height: 54, font: 17 },
  }
  const s = sizes[size] ?? sizes.md

  const palette: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background:
        hover && !disabled ? 'color-mix(in srgb, var(--solar) 92%, var(--ink))' : 'var(--solar)',
      color: 'var(--ink)',
      border: '1px solid transparent',
    },
    secondary: {
      background: hover && !disabled ? 'var(--ink-06)' : 'transparent',
      color: 'var(--ink)',
      border: '1px solid var(--ink)',
    },
    ghost: {
      background: hover && !disabled ? 'var(--ink-06)' : 'transparent',
      color: 'var(--ink)',
      border: '1px solid transparent',
    },
  }

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: s.height,
    minWidth: s.height,
    padding: s.padding,
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: s.font,
    lineHeight: 1,
    borderRadius: 'var(--radius-pill)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transform: active && !disabled ? 'scale(0.97)' : 'scale(1)',
    transition:
      'transform var(--dur-press) var(--ease-out), background var(--dur-press) var(--ease-out)',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    ...palette[variant],
    ...style,
  }

  return (
    <button
      type={type}
      disabled={disabled}
      title={disabled && reason ? reason : undefined}
      aria-busy={loading || undefined}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setActive(false)
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={base}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 15,
        height: 15,
        borderRadius: '50%',
        border: '2px solid color-mix(in srgb, currentColor 30%, transparent)',
        borderTopColor: 'currentColor',
        animation: 'hb-spin 700ms linear infinite',
        display: 'inline-block',
      }}
    />
  )
}
