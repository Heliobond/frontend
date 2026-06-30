'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Mark } from '../brand/Mark'

/**
 * Footer — quiet, honest. Includes "Talk to a human" (trust is shown, not
 * claimed) and a discreet link to the internal admin/oracle console.
 */
export function Footer() {
  const t = useTranslations('Footer')
  const links = [t('verify'), t('risk'), t('learn')]
  return (
    <footer className="hb-footer">
      <div className="hb-footer__inner">
        <div className="hb-footer__brand">
          <Mark size={24} />
          <span className="hb-footer__wordmark">heliobond</span>
        </div>
        <div className="hb-footer__links">
          {links.map((l) => (
            <button key={l} className="hb-textlink hb-footer__link">
              {l}
            </button>
          ))}
          <button className="hb-textlink hb-footer__link hb-footer__link--strong">
            {t('talk')}
          </button>
          <Link href="/admin" className="hb-textlink hb-footer__admin">
            {t('admin')}
          </Link>
        </div>
      </div>
    </footer>
  )
}
