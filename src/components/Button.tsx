import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'

/**
 * Heliobond Button - primary (pill, solar fill), secondary (ink outline), ghost.
 * Text on solar is ink (AAA). Active scales to 0.97. Disabled carries a reason
 * surfaced in a tooltip -- never a bare greyed control.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Visual variant styling ('primary', 'secondary', or 'ghost'). Defaults to 'primary'. */
  variant?: ButtonVariant
  /** Button sizing ('sm', 'md', or 'lg'). Defaults to 'md'. */
  size?: ButtonSize
  /** Whether to render the button in a loading spinner state. Defaults to false. */
  loading?: boolean
  /** Plain-language reason shown in a tooltip when disabled. */
  reason?: string
  /** Optional icon node rendered before the button text. */
  icon?: ReactNode
  /** Optional icon node rendered after the button text. */
  iconRight?: ReactNode
  /** Standard HTML button type ('button', 'submit', or 'reset'). Defaults to 'button'. */
  type?: 'button' | 'submit' | 'reset'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
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
  },
  ref,
) {
  const reasonId = useId()
  const explanation = disabled && reason ? reason : undefined
  // Preserve any describedby the caller passed, adding the reason's id.
  const describedBy =
    [rest['aria-describedby'], explanation ? reasonId : undefined].filter(Boolean).join(' ') ||
    undefined
  const [hover, setHover] = useState(false)
  const [active, setActive] = useState(false)

  const sizes: Record<ButtonSize, { padding: string; height: number; font: number }> = {
    sm: { padding: '0 14px', height: 36, font: 14 },
    md: { padding: '0 20px', height: 44, font: 15 },
    lg: { padding: '0 28px', height: 54, font: 17 },
  }
  const s = sizes[size] || sizes.md

  const palette: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background: 'var(--button-primary-bg)',
      color: 'var(--button-primary-fg)',
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
    ...style,
    ...palette[variant],
  }

  const button = (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      title={explanation}
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
      aria-describedby={describedBy}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  )

  if (!explanation) return button
  // A natively disabled button is skipped by keyboard focus and a `title` is
  // not reachable by touch, so the reason is also real text next to the button,
  // linked with aria-describedby. It is visually hidden (the hover title stays
  // for pointer users) but is read in the accessibility tree, and each control
  // gets its own id.
  return (
    <>
      {button}
      <span id={reasonId} style={visuallyHidden}>
        {explanation}
      </span>
    </>
  )
})

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
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
