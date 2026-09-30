'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import { CloseIcon } from './icons'
import { type AlertOperator } from '../lib/yieldAlerts'
import { useFocusTrap } from '../hooks/useFocusTrap'

/**
 * YieldAlertModal — dialog for creating or editing a yield alert on a
 * specific bond. Focus-trapped, keyboard accessible, uses the existing
 * Heliobond design tokens.
 */
export interface YieldAlertModalProps {
  open: boolean
  bondName: string
  currentYield: number
  /** Pre-filled values when editing an existing alert. */
  initialThreshold?: number
  initialOperator?: AlertOperator
  /** Whether we are editing (shows delete button). */
  editing?: boolean
  onSave: (threshold: number, operator: AlertOperator) => void
  onDelete?: () => void
  onClose: () => void
}

export function YieldAlertModal({
  open,
  bondName,
  currentYield,
  initialThreshold = 5,
  initialOperator = 'above',
  editing = false,
  onSave,
  onDelete,
  onClose,
}: YieldAlertModalProps) {
  const t = useTranslations('YieldAlert')
  const [threshold, setThreshold] = useState(String(initialThreshold))
  const [operator, setOperator] = useState<AlertOperator>(initialOperator)
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  useFocusTrap(open, dialogRef, firstInputRef, onClose)

  // Reseed the form when the modal opens with new values. Adjusting during
  // render is React's sanctioned way to reset state for a changed prop, and
  // avoids a wasted render pass (#598).
  const [seed, setSeed] = useState<{ open: boolean; threshold: number; operator: AlertOperator }>({
    open,
    threshold: initialThreshold,
    operator: initialOperator,
  })
  if (
    seed.open !== open ||
    seed.threshold !== initialThreshold ||
    seed.operator !== initialOperator
  ) {
    setSeed({ open, threshold: initialThreshold, operator: initialOperator })
    if (open) {
      setThreshold(String(initialThreshold))
      setOperator(initialOperator)
    }
  }

  const handleSave = useCallback(() => {
    const parsed = parseFloat(threshold)
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) return
    onSave(parsed, operator)
  }, [threshold, operator, onSave])

  const parsedThreshold = parseFloat(threshold)
  const isValid = !Number.isNaN(parsedThreshold) && parsedThreshold >= 0 && parsedThreshold <= 100

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 9990,
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? t('editTitle') : t('modalTitle')}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9991,
          width: 420,
          maxWidth: '92vw',
          background: 'var(--surface)',
          border: '1px solid var(--ink-12)',
          borderRadius: 'var(--radius-modal)',
          boxShadow: 'var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.2))',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px 0',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--type-h4)',
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            {editing ? t('editTitle') : t('modalTitle')}
          </h2>
          <button
            type="button"
            aria-label={t('cancelCta')}
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--ink-06)',
              cursor: 'pointer',
              color: 'var(--ink-60)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease',
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px 24px' }}>
          {/* Bond name + current yield */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '12px 16px',
              background: 'var(--ink-06)',
              borderRadius: 'var(--radius-input)',
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 'var(--type-data)',
                color: 'var(--ink)',
              }}
            >
              {bondName}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--type-data)',
                fontWeight: 600,
                color: 'var(--solar)',
                fontFeatureSettings: '"tnum" 1',
              }}
            >
              {currentYield.toFixed(1)}%
            </span>
          </div>

          {/* Operator toggle */}
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-eyebrow)',
              fontWeight: 600,
              color: 'var(--ink-60)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            {t('conditionLabel')}
          </label>
          <div
            style={{
              display: 'flex',
              gap: 0,
              marginBottom: 16,
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--ink-12)',
              overflow: 'hidden',
            }}
          >
            {(['above', 'below'] as AlertOperator[]).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setOperator(op)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                  background: operator === op ? 'var(--solar)' : 'var(--surface)',
                  color: operator === op ? 'var(--ink)' : 'var(--ink-60)',
                }}
              >
                {op === 'above' ? t('operatorAbove') : t('operatorBelow')}
              </button>
            ))}
          </div>

          {/* Threshold input */}
          <label
            htmlFor="yield-alert-threshold"
            style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-eyebrow)',
              fontWeight: 600,
              color: 'var(--ink-60)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            {t('thresholdLabel')}
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <input
              ref={firstInputRef}
              id="yield-alert-threshold"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              style={{
                flex: 1,
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--type-body-lg)',
                fontWeight: 600,
                color: 'var(--ink)',
                background: 'var(--surface)',
                border: '1px solid var(--ink-12)',
                borderRadius: 'var(--radius-input)',
                padding: '10px 14px',
                fontFeatureSettings: '"tnum" 1',
                outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid) handleSave()
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--type-body-lg)',
                fontWeight: 600,
                color: 'var(--ink-60)',
              }}
            >
              %
            </span>
          </div>

          {/* Preview */}
          {isValid && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--solar-12)',
                border: '1px solid var(--solar-24)',
                borderRadius: 'var(--radius-input)',
                marginBottom: 20,
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
                color: 'var(--ink)',
                lineHeight: 1.5,
              }}
            >
              🔔{' '}
              {t('previewText', {
                name: bondName,
                direction:
                  operator === 'above'
                    ? t('operatorAbove').toLowerCase()
                    : t('operatorBelow').toLowerCase(),
                threshold: parsedThreshold.toFixed(1),
              })}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            {editing && onDelete && (
              <Button
                variant="secondary"
                onClick={onDelete}
                style={{
                  color: 'var(--ember)',
                  borderColor: 'var(--ember)',
                }}
              >
                {t('deleteCta')}
              </Button>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="secondary" onClick={onClose}>
              {t('cancelCta')}
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!isValid}>
              {t('saveCta')}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
