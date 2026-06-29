import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'

/**
 * Heliobond IconButton — square, line-icon only, 44px hit target at md.
 */
export type IconButtonVariant = 'solid' | 'outline' | 'ghost'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** Accessible label — required; also used as the tooltip. */
  label: string
  children: ReactNode
}

export function IconButton({
  variant = 'ghost',
  size = 'md',
  label,
  disabled = false,
  onClick,
  children,
  style,
  ...rest
}: IconButtonProps) {
  const [hover, setHover] = useState(false)
  const [active, setActive] = useState(false)
  const dim = ({ sm: 36, md: 44, lg: 52 } as const)[size] ?? 44

  const palette: Record<IconButtonVariant, CSSProperties> = {
    solid: {
      background: hover ? 'color-mix(in srgb, var(--solar) 92%, var(--ink))' : 'var(--solar)',
      color: 'var(--ink)',
      border: '1px solid transparent',
    },
    outline: {
      background: hover ? 'var(--ink-06)' : 'transparent',
      color: 'var(--ink)',
      border: '1px solid var(--ink-12)',
    },
    ghost: {
      background: hover ? 'var(--ink-06)' : 'transparent',
      color: 'var(--ink)',
      border: '1px solid transparent',
    },
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setActive(false)
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        width: dim,
        height: dim,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-pill)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transform: active && !disabled ? 'scale(0.97)' : 'scale(1)',
        transition:
          'transform var(--dur-press) var(--ease-out), background var(--dur-press) var(--ease-out)',
        ...palette[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
