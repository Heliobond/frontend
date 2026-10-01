'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'hb-theme'
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : null
  } catch {
    return null
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}

/**
 * Theme state for the "After Sunset" dark mode. The actual paint-time theme is
 * set by THEME_SCRIPT before hydration (no flash); this provider mirrors that
 * choice into React state and persists changes. Light/dark is a pure token swap
 * via data-theme on <html>.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start 'light' on both server and first client render to avoid a hydration
  // mismatch; the real value is read from <html> (set by THEME_SCRIPT) on mount.
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    const media =
      typeof window.matchMedia === 'function' ? window.matchMedia(DARK_MODE_QUERY) : null
    const fromDom = document.documentElement.dataset.theme
    const current =
      readStoredTheme() ?? (isTheme(fromDom) ? fromDom : media?.matches ? 'dark' : 'light')
    applyTheme(current)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(current)

    const syncSystemTheme = (event: MediaQueryListEvent) => {
      // Once a person makes an explicit choice it wins. Until then, follow a
      // live OS theme change instead of requiring a reload.
      if (readStoredTheme()) return
      const next: Theme = event.matches ? 'dark' : 'light'
      applyTheme(next)
      setThemeState(next)
    }

    const syncOtherTabs = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return
      const next: Theme = isTheme(event.newValue)
        ? event.newValue
        : media?.matches
          ? 'dark'
          : 'light'
      applyTheme(next)
      setThemeState(next)
    }

    media?.addEventListener('change', syncSystemTheme)
    window.addEventListener('storage', syncOtherTabs)
    return () => {
      media?.removeEventListener('change', syncSystemTheme)
      window.removeEventListener('storage', syncOtherTabs)
    }
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* private mode / storage disabled -- theme just won't persist */
    }
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
  )
}
