'use client'

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'heliobond-theme'

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Applies the theme to <html> so CSS [data-theme="dark"] selectors react. */
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

export interface DarkModeToggleProps {
  theme?: Theme
  onToggle?: (next: Theme) => void
  label?: string
}

export function DarkModeToggle({ theme, onToggle, label = 'Toggle dark mode' }: DarkModeToggleProps) {
  const [current, setCurrent] = useState<Theme>(theme ?? initialTheme)

  useEffect(() => {
    applyTheme(current)
    try {
      window.localStorage.setItem(STORAGE_KEY, current)
    } catch {
      /* storage unavailable — ignore */
    }
  }, [current])

  useEffect(() => {
    if (theme !== undefined && theme !== current) setCurrent(theme)
  }, [theme]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(() => {
    setCurrent((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      onToggle?.(next)
      return next
    })
  }, [onToggle])

  const isDark = current === 'dark'

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={toggle}
      style={{
        width: 56,
        height: 30,
        borderRadius: 999,
        border: '1px solid rgba(0,0,0,0.18)',
        background: isDark ? '#1f2937' : '#fde68a',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 3,
          left: isDark ? 29 : 3,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: isDark ? '#111827' : '#f59e0b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'left 0.2s ease',
          fontSize: 13,
          color: isDark ? '#fde68a' : '#ffffff',
        }}
      >
        {isDark ? '\u263D' : '\u263C'}
      </span>
    </button>
  )
}
