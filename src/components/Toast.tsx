import { type CSSProperties, type ReactNode } from 'react'
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
  style?: CSSProperties
}

export function Toast({ tone = 'neutral', title, message, action, onDismiss, style }: ToastProps) {
  const accents: Record<ToastTone, string> = {
    neutral: 'var(--ink)',
    success: 'var(--growth)',
    error: 'var(--ember)',
    solar: 'var(--solar)',
  }
  const accent = accents[tone] || accents.neutral

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
