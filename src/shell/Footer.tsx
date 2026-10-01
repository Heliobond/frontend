'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Mark } from '../brand/Mark'
import { TelemetryPreference } from '../components/TelemetryConsent'

export function getSupportHref(value = process.env.NEXT_PUBLIC_SUPPORT_URL): string | null {
  const candidate = value?.trim()
  if (!candidate) return null
  if (candidate.startsWith('mailto:')) return candidate
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Footer — quiet, honest. Includes "Talk to a human" (trust is shown, not
 * claimed), the telemetry privacy control (#658) and a discreet link to the
 * internal admin/oracle console.
 */
export function Footer() {
  const t = useTranslations('Footer')
  const supportHref = getSupportHref()
  return (
    <footer className="hb-footer">
      <div className="hb-footer__inner">
        <div className="hb-footer__brand">
          <Mark size={24} />
          <span className="hb-footer__wordmark">heliobond</span>
        </div>
        <div className="hb-footer__links">
          <nav className="hb-footer__nav" aria-label={t('trustLinks')}>
            <Link href="/verify" className="hb-footer__link">
              {t('verify')}
            </Link>
            <Link href="/risk" className="hb-footer__link">
              {t('risk')}
            </Link>
            <Link href="/learn" className="hb-footer__link">
              {t('learn')}
            </Link>
            {supportHref ? (
              <a href={supportHref} className="hb-footer__link hb-footer__link--strong">
                {t('talk')}
              </a>
            ) : null}
            <Link href="/admin" className="hb-footer__admin">
              {t('admin')}
            </Link>
          </nav>
          <TelemetryPreference />
        </div>
      </div>
    </footer>
  )
}
