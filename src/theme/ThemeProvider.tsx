'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

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
    const current = (document.documentElement.dataset.theme as Theme) || 'light'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(current)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('hb-theme', next)
    } catch {
      /* private mode / storage disabled — theme just won't persist */
    }
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem('hb-theme', next)
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
