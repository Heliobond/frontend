'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from './Button'

export interface SessionTimeoutModalProps {
  /** Whether the modal is currently visible. */
  open: boolean
  /** Formatted MM:SS time remaining string. */
  formattedTime: string
  /** Callback fired when user chooses to stay logged in. */
  onExtend: () => void
  /** Callback fired when user chooses to disconnect immediately. */
  onLogout: () => void
}

/**
 * Accessible alert dialog notifying users of an impending session timeout,
 * giving them an opportunity to extend their session and prevent unsaved form data loss.
 */
export function SessionTimeoutModal({
  open,
  formattedTime,
  onExtend,
  onLogout,
}: SessionTimeoutModalProps) {
  const t = useTranslations('SessionTimeout')
  const extendBtnRef = useRef<HTMLButtonElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)

  // Auto-focus the primary extend button when modal opens
  useEffect(() => {
    if (open) {
      const prevActive = document.activeElement as HTMLElement | null
      const timer = setTimeout(() => {
        extendBtnRef.current?.focus()
      }, 50)

      return () => {
        clearTimeout(timer)
        prevActive?.focus()
      }
    }
  }, [open])

  // Trap focus & keyboard escape handler
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Esc extends the session by default to prevent accidental data loss
        onExtend()
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onExtend])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(11, 43, 35, 0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-desc"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--ink-12)',
          borderRadius: 'var(--radius-modal)',
          boxShadow: 'var(--shadow-lg)',
          maxWidth: 480,
          width: '100%',
          padding: '32px 28px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          animation: 'hb-rise 300ms var(--ease-out) forwards',
        }}
      >
        {/* Animated Warning Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            backgroundColor: 'var(--solar-12)',
            border: '2px solid var(--solar)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            marginBottom: 20,
          }}
          aria-hidden="true"
        >
          ⏳
        </div>

        <h2
          id="session-timeout-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--type-h3-sm)',
            fontWeight: 700,
            color: 'var(--ink)',
            margin: '0 0 10px',
            letterSpacing: '-0.01em',
          }}
        >
          {t('title')}
        </h2>

        <p
          id="session-timeout-desc"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-body)',
            lineHeight: 1.5,
            color: 'var(--ink-60)',
            margin: '0 0 20px',
          }}
        >
          {t('body')}
        </p>

        {/* Live Countdown Display */}
        <div
          style={{
            background: 'var(--ink-06)',
            border: '1px solid var(--ink-12)',
            borderRadius: 'var(--radius-card)',
            padding: '12px 20px',
            marginBottom: 24,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              color: 'var(--ink-60)',
              fontWeight: 500,
            }}
          >
            {t('expiresIn')}
          </span>
          <span
            className="hb-data"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--type-body-lg)',
              fontWeight: 700,
              color: 'var(--ember)',
            }}
          >
            {formattedTime}
          </span>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            width: '100%',
            flexDirection: 'row',
          }}
        >
          <Button
            variant="secondary"
            size="lg"
            onClick={onLogout}
            style={{ flex: 1 }}
          >
            {t('logoutCta')}
          </Button>
          <Button
            ref={extendBtnRef}
            variant="primary"
            size="lg"
            onClick={onExtend}
            style={{ flex: 1 }}
          >
            {t('extendCta')}
          </Button>
        </div>
      </div>
    </div>
  )
}
