import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import en from './messages/en.json'

type Messages = Record<string, unknown>

/**
 * `getTranslations()` needs a live request (cookies + the request config), which
 * jsdom doesn't have. Route metadata resolves its copy through it, so tests get
 * the English catalog directly instead — same shape, no network.
 */
vi.mock('next-intl/server', async () => {
  /** Resolves a dotted key against the English catalog, namespace included. */
  const lookup = (key: string, values?: Record<string, unknown>): string => {
    const value = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Messages)?.[part], en as unknown as Messages)
    if (typeof value !== 'string') throw new Error(`Missing message: ${key}`)
    // Plain `{arg}` interpolation, enough for the metadata messages.
    return values
      ? value.replace(/\{(\w+)\}/g, (m, name) => (name in values ? String(values[name]) : m))
      : value
  }
  return {
    // Mirrors next-intl: the returned translator is scoped to the namespace.
    getTranslations: async (namespace?: string) =>
      namespace
        ? (key: string, values?: Record<string, unknown>) => lookup(`${namespace}.${key}`, values)
        : lookup,
    getLocale: async () => 'en',
    getMessages: async () => en,
  }
})

/**
 * `LocaleProvider` calls `useRouter()`, which throws outside a mounted App Router.
 * The shared render helper wraps everything in it, so tests get a no-op router
 * unless a test file mocks `next/navigation` itself.
 */
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

if (typeof window !== 'undefined') {
  if (!window.localStorage || typeof window.localStorage.clear !== 'function') {
    const store = new Map<string, string>()
    const storageMock: Storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size
      },
    }
    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      writable: true,
    })
  }
}
