'use client'

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { useToast } from './Toast'
import { BellIcon, BellOffIcon } from './icons'

/**
 * PriceAlert — lets the user set a yield threshold and simulates
 * a notification when the projected yield crosses it.
 * Saves preference to localStorage. Demo: schedules a setTimeout
 * notification after 8 seconds if threshold is set.
 */
export interface PriceAlertProps {
  /** Current projected yield (e.g. 7.4) */
  currentYield: number
  /** Project name for the toast message */
  projectName: string
  style?: CSSProperties
}

const STORAGE_KEY_PREFIX = 'hb_price_alert_'

export function PriceAlert({ currentYield, projectName, style }: PriceAlertProps) {
  const { toast } = useToast()
  const [threshold, setThreshold] = useState<number | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [demoFired, setDemoFired] = useState(false)

  // Load from localStorage
  useEffect(() => {
    try {
      const key = STORAGE_KEY_PREFIX + projectName
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved)
        setThreshold(parsed.threshold)
        setEnabled(parsed.enabled ?? false)
        setInputValue(parsed.threshold != null ? String(parsed.threshold) : '')
      }
    } catch {
      // localStorage not available
    }
  }, [projectName])

  // Save to localStorage
  const persist = useCallback(
    (t: number | null, e: boolean) => {
      try {
        const key = STORAGE_KEY_PREFIX + projectName
        localStorage.setItem(key, JSON.stringify({ threshold: t, enabled: e }))
      } catch {
        // ignore
      }
    },
    [projectName],
  )

  // Demo: simulate yield crossing threshold after 8s
  useEffect(() => {
    if (!enabled || threshold == null || demoFired) return
    const simulatedYield = threshold + 0.3 // pretend yield went above threshold
    const timer = setTimeout(() => {
      setDemoFired(true)
      toast({
        tone: 'solar',
        title: `Yield alert: ${projectName}`,
        message: `Projected yield is now ${simulatedYield.toFixed(1)}% — above your ${threshold}% threshold.`,
        duration: 6000,
      })
    }, 8000)
    return () => clearTimeout(timer)
  }, [enabled, threshold, demoFired, projectName, toast])

  const handleToggle = () => {
    if (!enabled && threshold == null) {
      // Enable with default threshold near current yield
      const t = Math.round(currentYield * 10) / 10
      setThreshold(t)
      setInputValue(String(t))
      setEnabled(true)
      setDemoFired(false)
      persist(t, true)
      toast({
        tone: 'neutral',
        title: 'Alert enabled',
        message: `You'll be notified when ${projectName} yield crosses ${t}%.`,
        duration: 3000,
      })
    } else {
      setEnabled(!enabled)
      persist(threshold, !enabled)
      if (enabled) {
        toast({
          tone: 'neutral',
          title: 'Alert disabled',
          message: `Price alerts paused for ${projectName}.`,
          duration: 3000,
        })
      }
    }
  }

  const handleSetThreshold = () => {
    const v = parseFloat(inputValue)
    if (!Number.isFinite(v) || v <= 0) {
      toast({ tone: 'error', title: 'Invalid threshold', message: 'Enter a positive number.', duration: 3000 })
      return
    }
    setThreshold(v)
    setEnabled(true)
    setDemoFired(false)
    persist(v, true)
    toast({
      tone: 'success',
      title: 'Threshold set',
      message: `Alert will fire when ${projectName} yield crosses ${v}%.`,
      duration: 3000,
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '16px 20px',
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {enabled ? <BellIcon size={16} color="var(--solar)" /> : <BellOffIcon size={16} color="var(--ink-40)" />}
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-data)',
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            Price alert
          </span>
          {enabled && threshold != null && (
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--type-caption)',
                color: 'var(--solar)',
                background: 'var(--solar-06)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              {threshold}%
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleToggle}
          style={{
            appearance: 'none',
            border: 'none',
            background: enabled ? 'var(--solar)' : 'var(--ink-12)',
            color: enabled ? 'var(--canvas)' : 'var(--ink-60)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            fontWeight: 600,
            padding: '4px 14px',
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>

      {enabled && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              color: 'var(--ink-60)',
              whiteSpace: 'nowrap',
            }}
          >
            Notify when yield reaches
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSetThreshold() }}
            style={{
              width: 72,
              padding: '4px 8px',
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--type-data)',
              fontWeight: 600,
              color: 'var(--ink)',
              background: 'var(--canvas)',
              border: '1px solid var(--ink-12)',
              borderRadius: 'var(--radius-input)',
              textAlign: 'center',
            }}
            aria-label="Yield threshold percentage"
          />
          <span style={{ fontFamily: 'var(--font-data)', color: 'var(--ink-60)', fontSize: 'var(--type-data)' }}>%</span>
          <button
            type="button"
            onClick={handleSetThreshold}
            style={{
              appearance: 'none',
              border: '1px solid var(--ink-12)',
              background: 'var(--canvas)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-caption)',
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
            }}
          >
            Set
          </button>
        </div>
      )}

      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-fine)',
          color: 'var(--ink-40)',
          margin: 0,
        }}
      >
        Current projected yield: <b style={{ color: 'var(--ink)' }}>{currentYield}%</b>
        {enabled && threshold != null && (
          <> · Demo: a notification will fire in ~8 seconds</>
        )}
      </p>
    </div>
  )
}

export default PriceAlert
