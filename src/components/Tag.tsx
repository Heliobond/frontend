import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

/**
 * Heliobond Tag — a selectable filter/category pill. Selected state uses a
 * solar-tint fill paired with an ink label (color never alone).
 */
export interface TagProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  children: ReactNode
}

export function Tag({ selected = false, onClick, children, style, ...rest }: TagProps) {
  const [hover, setHover] = useState(false)
  const interactive = typeof onClick === 'function'
  return (
    <button
      type="button"
      className="hb-tag"
      aria-pressed={interactive ? selected : undefined}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 14px',
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: 'var(--type-small)',
        color: 'var(--ink)',
        background: selected
          ? 'var(--solar-12)'
          : hover && interactive
            ? 'var(--ink-06)'
            : 'transparent',
        border: selected ? '1px solid var(--solar)' : '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-pill)',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background var(--dur-press) var(--ease-out)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
