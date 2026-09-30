'use client'

import { useEffect, useId, type CSSProperties } from 'react'
import {
  getMemoByteLength,
  validateMemoLength,
  STELLAR_MAX_MEMO_TEXT_BYTES,
} from '../lib/stellarPayment'

export interface MemoInputProps {
  /** Current memo text value */
  value: string
  /** Callback triggered on memo text change */
  onChange: (value: string) => void
  /** Label for the input field. Defaults to "Memo" */
  label?: string
  /** Placeholder text. Defaults to "Up to 28 bytes" */
  placeholder?: string
  /** Maximum bytes allowed. Defaults to 28 per Stellar protocol */
  maxBytes?: number
  /** Whether the field is optional. Defaults to true */
  optional?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Custom hint text */
  hint?: string
  /** Notifies parent when validity state changes */
  onValidityChange?: (isValid: boolean) => void
  /** Optional container style overrides */
  style?: CSSProperties
}

/**
 * Accessible input for Stellar transaction memos with real-time UTF-8 byte counting.
 * Validates length in bytes (not character count) to prevent cryptic backend rejections.
 */
export function MemoInput({
  value,
  onChange,
  label = 'Memo',
  placeholder = 'Up to 28 bytes',
  maxBytes = STELLAR_MAX_MEMO_TEXT_BYTES,
  optional = true,
  disabled = false,
  hint,
  onValidityChange,
  style,
}: MemoInputProps) {
  const generatedId = useId()
  const inputId = `memo-input-${generatedId}`
  const errorId = `memo-error-${generatedId}`
  const counterId = `memo-counter-${generatedId}`

  const byteLength = getMemoByteLength(value)
  const validation = validateMemoLength(value, maxBytes)
  const isOverLimit = !validation.valid

  useEffect(() => {
    onValidityChange?.(!isOverLimit)
  }, [isOverLimit, onValidityChange])

  return (
    <div style={{ marginBottom: 18, ...style }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <label
          htmlFor={inputId}
          className="hb-eyebrow"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-eyebrow)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--ink)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {label}
          {optional && (
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                color: 'var(--ink-40)',
                textTransform: 'none',
                marginInlineStart: 6,
              }}
            >
              (optional)
            </span>
          )}
        </label>
        <span
          id={counterId}
          aria-live="polite"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 'var(--type-caption)',
            color: isOverLimit ? 'var(--ember)' : 'var(--ink-40)',
            fontWeight: isOverLimit ? 600 : 400,
          }}
        >
          {byteLength} / {maxBytes} bytes
        </span>
      </div>

      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={isOverLimit}
        aria-describedby={isOverLimit ? `${errorId} ${counterId}` : counterId}
        style={{
          width: '100%',
          minHeight: 44,
          padding: '0 14px',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-data)',
          color: 'var(--ink)',
          background: 'var(--surface)',
          border: isOverLimit ? '1.5px solid var(--ember)' : '1px solid var(--ink-12)',
          borderRadius: 'var(--radius-input)',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s ease',
        }}
      />

      {isOverLimit && (
        <div
          id={errorId}
          role="alert"
          style={{
            marginTop: 6,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            color: 'var(--ember)',
            lineHeight: 1.4,
          }}
        >
          Memo cannot exceed {maxBytes} bytes (currently {byteLength} bytes).
        </div>
      )}

      {hint && !isOverLimit && (
        <div
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            color: 'var(--ink-40)',
          }}
        >
          {hint}
        </div>
      )}
    </div>
  )
}
