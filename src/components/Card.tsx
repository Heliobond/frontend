import { type HTMLAttributes, type ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ children, style, className, ...props }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
      className={['card', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
