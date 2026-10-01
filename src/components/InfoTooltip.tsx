'use client'

import { useEffect, useId, useRef, useState } from 'react'

export interface InfoTooltipProps {
  label: string
  content: string
}

/** Tap/click- and keyboard-operated help text for information that hover tooltips hide on touch. */
export function InfoTooltip({ label, content }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <span
      ref={rootRef}
      style={{ position: 'relative', display: 'inline-flex', marginInlineStart: 6 }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        style={{
          width: 20,
          height: 20,
          padding: 0,
          border: '1px solid var(--ink-24)',
          borderRadius: '50%',
          background: 'var(--surface)',
          color: 'var(--ink-60)',
          font: 'inherit',
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 10,
            insetInlineEnd: 0,
            bottom: 'calc(100% + 8px)',
            width: 'min(280px, calc(100vw - 48px))',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--ink)',
            color: 'var(--surface)',
            boxShadow: 'var(--shadow-md)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            fontWeight: 400,
            lineHeight: 1.5,
            textAlign: 'start',
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
