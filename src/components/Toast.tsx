'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { CloseIcon } from './icons'

/**
 * Heliobond Toast — enters and exits from the same edge, swipe-to-dismiss in
 * spirit. Tones use an ink/semantic label + icon, never color alone. State
 * changes that matter (preview, balance) belong in aria-live regions elsewhere;
 * this is for transient confirmations.
 */
export type ToastTone = 'neutral' | 'success' | 'error' | 'solar'

export interface ToastProps {
  tone?: ToastTone
  title?: string
  message?: string
  action?: ReactNode
  onDismiss?: () => void
  href?: string
  stackable?: boolean
  style?: CSSProperties
}

export function Toast({ tone = 'neutral', title, message, action, onDismiss, href, style }: ToastProps) {
  const accents: Record<ToastTone, string> = {
    neutral: 'var(--ink)',
    success: 'var(--growth)',
    error: 'var(--ember)',
    solar: 'var(--solar)',
  }
  const accent = accents[tone] || accents.neutral

  const inner = (
    <>
      <span
        style={{
          width: 4,
          alignSelf: 'stretch',
          borderRadius: 'var(--radius-pill)',
          background: accent,
          flex: '0 0 auto',
        }}
        aria-hidden="true"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 'var(--type-data)',
              color: 'var(--ink)',
              marginBottom: message ? 2 : 0,
            }}
          >
            {title}
          </div>
        )}
        {message && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              lineHeight: 1.45,
              color: 'var(--ink-60)',
            }}
          >
            {message}
          </div>
        )}
        {action && <div style={{ marginTop: 10 }}>{action}</div>}
      </div>
    </>
  )

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        width: 360,
        maxWidth: '90vw',
        padding: '14px 14px 14px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-md)',
        ...style,
      }}
    >
      {href ? (
        <a
          href={href}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            flex: 1,
            minWidth: 0,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          {inner}
        </a>
      ) : (
        inner
      )}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            flex: '0 0 auto',
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--ink-60)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}

export interface ToastContextType {
  toast: (options: Omit<ToastProps, 'onDismiss'> & { duration?: number }) => void
  dismiss: (id?: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

const MAX_ACTIVE_TOASTS = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [activeToasts, setActiveToasts] = useState<
    (ToastProps & { id: string; duration?: number })[]
  >([])

  const showToast = useCallback(
    (options: Omit<ToastProps, 'onDismiss'> & { duration?: number }) => {
      const id = Math.random().toString(36).substring(2, 9)
      setActiveToasts((prev) => {
        const next = [...prev, { ...options, id }]
        return next.length > MAX_ACTIVE_TOASTS ? next.slice(next.length - MAX_ACTIVE_TOASTS) : next
      })

      const ms = options.duration ?? 5000
      if (ms > 0) {
        setTimeout(() => {
          setActiveToasts((prev) => prev.filter((t) => t.id !== id))
        }, ms)
      }
    },
    [],
  )

  const dismiss = useCallback((id?: string) => {
    if (id) {
      setActiveToasts((prev) => prev.filter((t) => t.id !== id))
    } else {
      setActiveToasts([])
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toast: showToast, dismiss }}>
      {children}
      {activeToasts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'fixed',
            insetInlineEnd: 24,
            bottom: 24,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'flex-end',
          }}
        >
          {activeToasts.map((activeToast) => (
            <Toast
              key={activeToast.id}
              tone={activeToast.tone}
              title={activeToast.title}
              message={activeToast.message}
              action={activeToast.action}
              href={activeToast.href}
              onDismiss={() => dismiss(activeToast.id)}
              style={activeToast.style}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}