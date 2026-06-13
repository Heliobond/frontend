'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '../components'
import { Mark } from '../brand/Mark'
import { useWallet, shortAddress } from '../wallet/WalletProvider'
import { useTheme } from '../theme/ThemeProvider'

/**
 * TopBar — persistent nav rendered by the root layout. Analemma mark + Explore /
 * How it works / Learn / Creator, network status dot, theme toggle, language
 * switcher, Connect (or the connected wallet pill). Active state derives from the
 * route (and a scroll-spy for the landing anchors); connection from the wallet.
 */
const NAV = [
  { href: '/explore', key: 'explore' },
  { href: '/#how', key: 'how' },
  { href: '/#verify', key: 'learn' },
  { href: '/creator', key: 'creator' },
] as const

export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Nav')
  const { connected, address, connecting, isDemo } = useWallet()
  const { theme, toggle } = useTheme()

  // Theme state starts 'light' on server/first render (to avoid a hydration
  // mismatch), so the toggle icon can't be trusted until after mount — a
  // dark-mode user would briefly see the wrong icon. Gate it on `mounted`.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Scroll-spy for the anchor nav items (How it works / Learn). usePathname()
  // drops the hash, so observe the landing sections instead. SSR-safe.
  const [activeHash, setActiveHash] = useState('')
  useEffect(() => {
    if (pathname !== '/') {
      setActiveHash('')
      return
    }
    const sections = ['how', 'verify']
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (!sections.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (top) setActiveHash(`#${top.target.id}`)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [pathname])

  const switchLocale = () => {
    const next = locale === 'en' ? 'fr' : 'en'
    document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;samesite=lax`
    router.refresh()
  }

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        padding: '0 32px',
        height: 68,
        background: 'color-mix(in srgb, var(--canvas) 86%, transparent)',
        backdropFilter: 'saturate(140%) blur(12px)',
        WebkitBackdropFilter: 'saturate(140%) blur(12px)',
        borderBottom: '1px solid var(--ink-12)',
      }}
    >
      <Link href="/" aria-label="Heliobond — home" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <Mark />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
          heliobond
        </span>
      </Link>

      <nav className="hb-topbar-nav" style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
        {NAV.map(({ href, key }) => {
          const active = href.includes('#') ? pathname === '/' && activeHash === href.slice(href.indexOf('#')) : pathname === href
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? 'page' : undefined}
              style={{
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--font-body)',
                fontSize: 14.5,
                fontWeight: 500,
                color: active ? 'var(--ink)' : 'var(--ink-60)',
              }}
            >
              {t(key)}
            </Link>
          )
        })}
      </nav>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-data)', fontSize: 12, color: 'var(--ink-60)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--growth)', boxShadow: '0 0 0 3px var(--growth-12)' }} />
          {t('testnet')}
        </span>

        <button
          onClick={toggle}
          aria-label={mounted && theme === 'dark' ? t('switchToLight') : t('switchToDark')}
          title={mounted && theme === 'dark' ? t('switchToLight') : t('switchToDark')}
          style={iconBtnStyle}
        >
          {mounted ? theme === 'dark' ? <SunIcon /> : <MoonIcon /> : null}
        </button>

        <button onClick={switchLocale} aria-label={t('language')} style={{ ...iconBtnStyle, width: 'auto', gap: 5, padding: '0 6px', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-60)' }}>
          {locale.toUpperCase()}
          <ChevronDown />
        </button>

        {connected && address ? (
          <WalletMenu address={address} isDemo={isDemo} />
        ) : (
          <Button variant="primary" size="md" loading={connecting} onClick={() => router.push('/connect')}>
            {t('connect')}
          </Button>
        )}
      </div>
    </header>
  )
}

const iconBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 38,
  height: 38,
  borderRadius: 'var(--radius-pill)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--ink-60)',
} as const

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

/** The connected wallet pill + its account menu (incl. Disconnect / sign out). */
function WalletMenu({ address, isDemo }: { address: string; isDemo: boolean }) {
  const t = useTranslations('Nav')
  const router = useRouter()
  const { disconnect } = useWallet()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const copy = () => {
    try {
      navigator.clipboard?.writeText(address)
    } catch {
      /* ignore */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--surface)',
          border: '1px solid var(--ink-12)',
          borderRadius: 'var(--radius-pill)',
          height: 40,
          padding: '0 6px 0 14px',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 13, color: 'var(--ink)' }}>{shortAddress(address)}</span>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--solar)' }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 48,
            right: 0,
            minWidth: 224,
            background: 'var(--surface)',
            border: '1px solid var(--ink-12)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-md)',
            padding: 6,
            zIndex: 400,
          }}
        >
          <div style={{ padding: '8px 10px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 12.5, color: 'var(--ink)' }}>{shortAddress(address, 6, 6)}</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--ink-40)' }}>{isDemo ? t('demoSession') : t('testnet')}</span>
          </div>
          <div style={{ height: 1, background: 'var(--ink-12)', margin: '4px 0' }} />
          <MenuItem onClick={() => { setOpen(false); router.push('/portfolio') }}>{t('portfolio')}</MenuItem>
          <MenuItem onClick={copy}>{copied ? t('copied') : t('copyAddress')}</MenuItem>
          {!isDemo && <MenuLink href={`https://stellar.expert/explorer/testnet/account/${address}`}>{t('viewOnExplorer')}</MenuLink>}
          <MenuItem tone="ember" onClick={() => { disconnect(); setOpen(false); router.push('/') }}>
            {t('disconnect')}
          </MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: 'ember' }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...menuItemStyle, background: hover ? 'var(--ink-06)' : 'transparent', color: tone === 'ember' ? 'var(--ember)' : 'var(--ink)' }}
    >
      {children}
    </button>
  )
}

function MenuLink({ children, href }: { children: ReactNode; href: string }) {
  const [hover, setHover] = useState(false)
  return (
    <a
      role="menuitem"
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...menuItemStyle, textDecoration: 'none', background: hover ? 'var(--ink-06)' : 'transparent', color: 'var(--ink)' }}
    >
      {children} ↗
    </a>
  )
}

const menuItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  cursor: 'pointer',
  padding: '9px 10px',
  borderRadius: 'var(--radius-input)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  fontWeight: 500,
}
