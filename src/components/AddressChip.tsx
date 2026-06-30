import { useState, type CSSProperties } from 'react'
import { CheckIcon, CopyIcon, ExternalIcon } from './icons'

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
          fontSize: 'var(--type-caption)',
          color: 'var(--ink)',
          letterSpacing: '0.01em',
        }}
      >
        {truncated}
      </span>
      <button
        type="button"
        aria-label={copied ? 'Copied' : `Copy ${label}`}
        onClick={copy}
        style={iconBtn}
      >
        {copied ? <CheckIcon style={{ color: 'var(--growth)' }} /> : <CopyIcon />}
      </button>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`View ${label} on Stellar Expert`}
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
