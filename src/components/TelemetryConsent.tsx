'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import {
  TELEMETRY_CONSENT_EVENT,
  isTelemetryAllowed,
  readTelemetryConsent,
  setTelemetryConsent,
  type TelemetryConsent,
} from '../lib/telemetryConsent'

/**
 * Asks the visitor for a telemetry choice and records it (#658).
 *
 * Telemetry is opt-in: until the visitor presses one of the two buttons, nothing
 * is reported — see `isTelemetryAllowed()`. The choice is persisted in
 * `localStorage` under `hb-telemetry-consent`, so it survives reloads and is
 * readable again from the footer's "Privacy" link, which reopens this banner so
 * the visitor can change their mind.
 */
export function TelemetryConsent() {
  const t = useTranslations('Telemetry')
  // `undefined` until the client has read localStorage, so SSR renders nothing
  // and the banner never flashes for someone who already made a choice.
  const [choice, setChoice] = useState<TelemetryConsent | null | undefined>(undefined)
  const [reopened, setReopened] = useState(false)

  useEffect(() => {
    const sync = () => setChoice(readTelemetryConsent())
    sync()
    // Another tab (or the same tab, via setTelemetryConsent) changed the choice.
    window.addEventListener(TELEMETRY_CONSENT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(TELEMETRY_CONSENT_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // Footer "Privacy" link: reopen the banner so the choice can be changed.
  useEffect(() => {
    const reopen = () => {
      setReopened(true)
      setChoice(readTelemetryConsent())
    }
    window.addEventListener(TELEMETRY_CONSENT_OPEN_EVENT, reopen)
    return () => window.removeEventListener(TELEMETRY_CONSENT_OPEN_EVENT, reopen)
  }, [])

  const decide = useCallback((next: TelemetryConsent) => {
    setTelemetryConsent(next)
    setReopened(false)
  }, [])

  if (choice === undefined) return null
  // Asked once, dismissed by a choice — stay hidden until reopened from the footer.
  if (choice !== null && !reopened) return null

  return (
    <div
      role="region"
      aria-label={t('title')}
      data-testid="telemetry-consent"
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 900,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '16px 24px',
        background: 'var(--surface)',
        borderTop: '1px solid var(--ink-12)',
        boxShadow: 'var(--shadow-md)',
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
      }}
    >
      <div style={{ ...copyStyle, maxWidth: 640 }}>
        <strong style={{ fontWeight: 600 }}>{t('title')}</strong>{' '}
        <span style={{ color: 'var(--ink-60)' }}>{t('body')}</span>{' '}
        <a href="/risk" style={linkStyle}>
          {t('learnMore')}
        </a>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="ghost" size="sm" onClick={() => decide('denied')}>
          {t('decline')}
        </Button>
        <Button variant="primary" size="sm" onClick={() => decide('granted')}>
          {t('accept')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Privacy control for the footer's preference surface. Reports the current
 * decision in plain language and lets the visitor reopen the consent banner.
 */
export function TelemetryPreference() {
  const t = useTranslations('Telemetry')
  const [choice, setChoice] = useState<TelemetryConsent | null | undefined>(undefined)

  useEffect(() => {
    const sync = () => setChoice(readTelemetryConsent())
    sync()
    window.addEventListener(TELEMETRY_CONSENT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(TELEMETRY_CONSENT_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const open = useCallback(() => {
    window.dispatchEvent(new Event(TELEMETRY_CONSENT_OPEN_EVENT))
  }, [])

  // "Not set" (no choice recorded) is distinct from "Off" (declined, or the
  // browser's DNT/GPC signal overriding a grant).
  const status =
    choice === undefined || choice === null
      ? t('statusUndecided')
      : isTelemetryAllowed()
        ? t('statusOn')
        : t('statusOff')

  return (
    <div style={preferenceStyle}>
      <span style={preferenceLabelStyle}>{t('label')}</span>
      <button type="button" onClick={open} data-testid="telemetry-preference" style={buttonStyle}>
        {status}
      </button>
    </div>
  )
}

/** Dispatched by the preference control to ask the banner to reopen. */
export const TELEMETRY_CONSENT_OPEN_EVENT = 'hb-telemetry-consent-open'

const copyStyle: CSSProperties = { fontSize: 14, lineHeight: 1.5 }

const linkStyle: CSSProperties = { color: 'var(--ink-60)', textDecoration: 'underline' }

const preferenceStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'var(--ink-60)',
}

const preferenceLabelStyle: CSSProperties = { fontFamily: 'var(--font-data)', fontSize: 12.5 }

const buttonStyle: CSSProperties = {
  font: 'inherit',
  fontSize: 13,
  color: 'var(--ink)',
  background: 'transparent',
  border: '1px solid var(--ink-20)',
  borderRadius: 'var(--radius-pill)',
  padding: '4px 12px',
  cursor: 'pointer',
  textDecoration: 'underline',
}
