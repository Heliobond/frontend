'use client'

import { useTranslations } from 'next-intl'
import {
  type AuthProviderType,
  getProviderDisplayName,
} from '../lib/auth/accountProviderDetection'
import { Button } from './Button'

export interface SocialAccountConflictWarningProps {
  /** The social provider already associated with this email (e.g. 'google', 'apple'). */
  provider: AuthProviderType
  /** The entered email address. */
  email: string
  /** Callback fired when user chooses to sign in with their existing social provider. */
  onContinueWithProvider: (provider: AuthProviderType) => void
  /** Optional callback if the user explicitly wants to proceed with email login or account linking. */
  onProceedWithEmail?: () => void
}

/**
 * High-contrast alert banner warning the user that their email is already linked
 * to a social identity provider (e.g. Google), preventing accidental duplicate account creation.
 */
export function SocialAccountConflictWarning({
  provider,
  email,
  onContinueWithProvider,
  onProceedWithEmail,
}: SocialAccountConflictWarningProps) {
  const t = useTranslations('AccountConflict')
  const providerName = getProviderDisplayName(provider)

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--solar)',
        borderRadius: 'var(--radius-card)',
        padding: '16px 20px',
        margin: '16px 0',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        animation: 'hb-rise 200ms var(--ease-out) forwards',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          style={{
            fontSize: 20,
            lineHeight: 1,
            padding: 4,
            borderRadius: '50%',
            background: 'var(--solar-12)',
            color: 'var(--ink)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-hidden="true"
        >
          💡
        </span>
        <div style={{ flex: 1 }}>
          <h4
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--type-body)',
              fontWeight: 700,
              color: 'var(--ink)',
              margin: '0 0 4px',
            }}
          >
            {t('conflictTitle', { provider: providerName })}
          </h4>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              lineHeight: 1.45,
              color: 'var(--ink-60)',
              margin: 0,
            }}
          >
            {t('conflictBody', { email, provider: providerName })}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <Button
          variant="primary"
          size="sm"
          onClick={() => onContinueWithProvider(provider)}
        >
          {t('continueWithProvider', { provider: providerName })}
        </Button>

        {onProceedWithEmail && (
          <button
            type="button"
            onClick={onProceedWithEmail}
            className="hb-textlink"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-caption)',
              padding: '6px 8px',
            }}
          >
            {t('sendLinkAnyway')}
          </button>
        )}
      </div>
    </div>
  )
}
