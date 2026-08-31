'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  detectEmailAuthProvider,
  type AuthProviderType,
} from '../lib/auth/accountProviderDetection'
import { SocialAccountConflictWarning } from './SocialAccountConflictWarning'
import { Button } from './Button'

export interface EmailAuthModalProps {
  /** Whether the modal is visible. */
  open: boolean
  /** Callback to close the modal. */
  onClose: () => void
  /** Callback fired when email submission is successful. */
  onSuccess?: (email: string) => void
  /** Callback fired when user redirects to a social provider. */
  onSocialLogin?: (provider: AuthProviderType) => void
}

/**
 * Modal dialog for email-based onboarding and sign-in with real-time social conflict detection.
 */
export function EmailAuthModal({
  open,
  onClose,
  onSuccess,
  onSocialLogin,
}: EmailAuthModalProps) {
  const t = useTranslations('AccountConflict')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [bypassWarning, setBypassWarning] = useState(false)

  if (!open) return null

  const detection = detectEmailAuthProvider(email)
  const showConflict = detection.hasConflict && !bypassWarning && detection.existingProvider !== null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || showConflict) return

    setSubmitted(true)
    if (onSuccess) {
      onSuccess(email)
    }
  }

  const handleSocialSelect = (provider: AuthProviderType) => {
    if (onSocialLogin) {
      onSocialLogin(provider)
    }
    onClose()
  }

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-auth-title"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--ink-12)',
          borderRadius: 'var(--radius-modal)',
          boxShadow: 'var(--shadow-lg)',
          maxWidth: 460,
          width: '100%',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          padding: 28,
          animation: 'hb-rise 200ms var(--ease-out) forwards',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3
            id="email-auth-title"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--type-h3-sm)',
              fontWeight: 700,
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            {t('modalTitle')}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: 'var(--ink-40)',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--type-body)', color: 'var(--ink)' }}>
              {t('linkSentMessage', { email })}
            </p>
            <Button variant="secondary" size="md" onClick={onClose} style={{ marginTop: 16 }}>
              {t('close')}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label
              htmlFor="auth-email-input"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
                color: 'var(--ink)',
                fontWeight: 600,
              }}
            >
              {t('emailInputLabel')}
            </label>
            <input
              id="auth-email-input"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setBypassWarning(false)
              }}
              placeholder="you@example.com"
              required
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-body)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--ink-12)',
                background: 'var(--canvas)',
                color: 'var(--ink)',
                outline: 'none',
              }}
            />

            {/* Social Account Collision Warning */}
            {showConflict && detection.existingProvider && (
              <SocialAccountConflictWarning
                provider={detection.existingProvider}
                email={email}
                onContinueWithProvider={handleSocialSelect}
                onProceedWithEmail={() => setBypassWarning(true)}
              />
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={showConflict || !email}
              style={{ marginTop: 8 }}
            >
              {t('submitCta')}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
