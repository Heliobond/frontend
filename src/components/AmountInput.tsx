import { type CSSProperties, type ReactNode, useState } from 'react'

/**
 * Heliobond AmountInput — the heart of deposit & withdraw. Mono numerals, a
 * visible balance, quick chips (25/50/100/Max), a live on-chain preview slot,
 * and the liquidity-cap honesty behaviour: typing past `cap` does NOT error —
 * it explains, and offers max.
 */
export interface AmountInputProps {
  value?: string
  onChange?: (value: string) => void
  currency?: string
  balanceLabel?: string
  balance?: string
  chips?: number[]
  cap?: number
  capMessage?: string
  maxChipLabel?: string
  capActionLabel?: string
  preview?: ReactNode
  label?: string
  id?: string
  style?: CSSProperties
}

export function AmountInput({
  value = '',
  onChange,
  currency = 'USDC',
  balanceLabel = '',
  balance,
  chips = [25, 50, 100],
  cap,
  capMessage,
  maxChipLabel,
  capActionLabel,
  preview,
  label = '',
  id = 'hb-amount',
  style,
}: AmountInputProps) {
  const num = parseFloat(value)
  const overCap = cap != null && !isNaN(num) && num > cap
  const showCapNotice = overCap && (Boolean(capMessage) || Boolean(capActionLabel))

  // Announce the cap message only once when overCap first becomes true,
  // not on every keystroke while already over cap (fixes #76).
  const wasOverCap = useRef(false)
  const liveMsg = overCap && !wasOverCap.current ? (capMessage ?? '') : ''
  wasOverCap.current = overCap

  const set = (v: number) => onChange?.(String(v))

  return (
    <div style={{ position: 'relative', ...style }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <label
          htmlFor={id}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-small)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          {label}
        </label>
        {balance != null && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--type-caption)',
              color: 'var(--ink-60)',
            }}
          >
            {balanceLabel} {balance} {currency}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--surface)',
          border: `1px solid ${overCap ? 'var(--solar)' : 'var(--ink-12)'}`,
          borderRadius: 'var(--radius-input)',
          padding: '0 16px',
          height: 64,
          transition: 'border-color var(--dur-press) var(--ease-out)',
        }}
      >
        <input
          id={id}
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange?.(sanitizeAmount(e.target.value))}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-data)',
            fontWeight: 600,
            fontSize: 'var(--type-data-display)',
            color: 'var(--ink)',
            fontFeatureSettings: '"tnum" 1',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 'var(--type-data)',
            color: 'var(--ink-60)',
            fontWeight: 500,
          }}
        >
          {currency}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {chips.map((c) => (
          <button key={c} type="button" onClick={() => set(c)} style={chipStyle}>
            {c}
          </button>
        ))}
        {cap != null && maxChipLabel && (
          <button
            key="max"
            type="button"
            onClick={() => set(cap)}
            style={{ ...chipStyle, borderColor: 'var(--ink)' }}
          >
            {maxChipLabel}
          </button>
        )}
      </div>

      {showCapNotice && (
        <div
          style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'var(--solar-12)',
            border: '1px solid var(--solar-24)',
            borderRadius: 'var(--radius-input)',
          }}
          role="status"
        >
          {capMessage && (
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--ink)',
              }}
            >
              {capMessage}
            </p>
          )}
          {capActionLabel && (
            <button
              type="button"
              onClick={() => cap != null && set(cap)}
              style={{
                marginTop: capMessage ? 8 : 0,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 13,
                color: 'var(--ink)',
                textDecoration: 'underline',
                textUnderlineOffset: '0.2em',
              }}
            >
              {capActionLabel}
            </button>
          )}
        </div>
      )}

      {/* Hidden live region: announces cap message once when overCap first becomes true */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
        }}
      >
        {liveMsg}
      </div>

      {preview && (
        <div
          aria-live="polite"
          style={{
            marginTop: 12,
            padding: '14px 16px',
            background: 'var(--ink-06)',
            borderRadius: 'var(--radius-input)',
          }}
        >
          {preview}
        </div>
      )}
    </div>
  )
}

const chipStyle: CSSProperties = {
  flex: 1,
  height: 36,
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--ink-12)',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontWeight: 600,
  fontSize: 'var(--type-small)',
  color: 'var(--ink)',
}

export function sanitizeAmount(val: string): string {
  const clean = val.replace(/[^0-9.]/g, '')
  const parts = clean.split('.')
  return parts.length > 1 ? parts[0] + '.' + parts.slice(1).join('') : clean
}
