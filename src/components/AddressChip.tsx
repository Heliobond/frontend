'use client'

import { useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Heliobond AddressChip — a Stellar address or tx hash, truncated in the
 * MIDDLE (never the end), mono, with one-tap copy and an explorer link.
 * Embodies "every figure traces to chain in <= 2 taps".
 */
export interface AddressChipProps {
  value: string
  lead?: number
  tail?: number
  explorerUrl?: string
  label?: string
  style?: CSSProperties
}

export function AddressChip({
  value,
  lead = 6,
  tail = 6,
  explorerUrl,
  label = 'address',
  style,
}: AddressChipProps) {
  const t = useTranslations('Common')
  const [copied, setCopied] = useState(false)
  const [hover, setHover] = useState(false)

  const truncated =
    value && value.length > lead + tail + 1
      ? `${value.slice(0, lead)}…${value.slice(-tail)}`
      : value

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 6px 0 12px',
        background: hover ? 'var(--ink-06)' : 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-pill)',
        transition: 'background var(--dur-press) var(--ease-out)',
        ...style,
      }}
    >
      <span
        title={value}
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 13,
          color: 'var(--ink)',
          letterSpacing: '0.01em',
        }}
      >
        {truncated}
      </span>
      <button
        type="button"
        aria-label={copied ? t('copied') : t('copyAddress', { label })}
        onClick={copy}
        style={iconBtn}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={t('viewOnExplorer', { label })}
          style={iconBtn}
        >
          <ExternalIcon />
        </a>
      )}
    </span>
  )
}

const iconBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--ink-60)',
  textDecoration: 'none',
}

const ico: CSSProperties = {
  width: 15,
  height: 15,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" style={ico} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ ...ico, stroke: 'var(--growth)' }} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" style={ico} aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}
