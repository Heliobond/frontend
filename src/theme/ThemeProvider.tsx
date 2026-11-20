'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'
export type ThemePreference = Theme | 'system'

const THEME_STORAGE_KEY = 'hb-theme'
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

interface ThemeContextValue {
  theme: Theme
  preference: ThemePreference
  toggle: () => void
  setTheme: (preference: ThemePreference) => void
}

const INITIAL_THEME = { theme: 'light', preference: 'system' } as const
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

function systemMedia() {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_MODE_QUERY) : null
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
  const [current, setCurrent] =
    useState<Pick<ThemeContextValue, 'theme' | 'preference'>>(INITIAL_THEME)
  // Keep a live preference for media events even if localStorage is unavailable.
  const currentRef = useRef(current)

  const updateTheme = useCallback((nextPreference: ThemePreference, nextTheme: Theme) => {
    const next = { preference: nextPreference, theme: nextTheme }
    currentRef.current = next
    setCurrent(next)
    applyTheme(nextTheme)
  }, [])

  useEffect(() => {
    const media = systemMedia()
    const stored = readStoredTheme()
    const fromDom = document.documentElement.dataset.theme
    const initial = stored ?? (isTheme(fromDom) ? fromDom : media?.matches ? 'dark' : 'light')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateTheme(stored ?? 'system', initial)

    const syncSystemTheme = (event: MediaQueryListEvent) => {
      // Once a person makes an explicit choice it wins. Until then, follow a
      // live OS theme change instead of requiring a reload.
      if (currentRef.current.preference !== 'system') return
      updateTheme('system', event.matches ? 'dark' : 'light')
    }

    const syncOtherTabs = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
      const stored = isTheme(event.newValue) ? event.newValue : null
      updateTheme(stored ?? 'system', stored ?? (media?.matches ? 'dark' : 'light'))
    }

    media?.addEventListener('change', syncSystemTheme)
    window.addEventListener('storage', syncOtherTabs)
    return () => {
      media?.removeEventListener('change', syncSystemTheme)
      window.removeEventListener('storage', syncOtherTabs)
    }
  }, [updateTheme])

  const setTheme = useCallback(
    (next: ThemePreference) => {
      updateTheme(next, next === 'system' ? (systemMedia()?.matches ? 'dark' : 'light') : next)
      try {
        if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
        else localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        /* private mode / storage disabled -- theme just won't persist */
      }
    },
    [updateTheme],
  )

  const toggle = useCallback(() => {
    setTheme(currentRef.current.theme === 'dark' ? 'light' : 'dark')
  }, [setTheme])

  return (
    <ThemeContext.Provider value={{ ...current, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
