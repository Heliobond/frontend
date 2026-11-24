import { afterEach, expect, jest, mock, vi as nativeVi, type Mock } from 'bun:test'
import * as matchers from '@testing-library/jest-dom/matchers'
import { JSDOM } from 'jsdom'
import { vi } from '../src/test/bun'
import en from '../messages/en.json'

const { window } = new JSDOM('', { url: 'http://localhost:3000/', pretendToBeVisual: true })
const browserGlobals = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'Event',
  'CustomEvent',
  'EventTarget',
  'DOMException',
  'Blob',
  'File',
])
const previousGlobals = new Map<string, PropertyDescriptor | undefined>()
for (const name of Object.getOwnPropertyNames(window)) {
  if (!(name in globalThis) || browserGlobals.has(name)) {
    previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get: () => Reflect.get(window, name),
      set: (value: unknown) => {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
      },
    })
  }
}

export function restoreNodeGlobals() {
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
  previousGlobals.clear()
  window.close()
}

expect.extend({
  ...matchers,
  toHaveBeenCalledExactlyOnceWith(received, ...args) {
    const calls = (received as Mock<(...args: never[]) => unknown>).mock.calls
    return {
      pass: calls.length === 1 && this.equals(calls[0], args),
      message: () => 'Expected one call with the given arguments',
    }
  },
})

const navigation = { ...(await import('next/navigation')) }
mock.module('next/navigation', () => ({
  ...navigation,
  useRouter: () => ({
    push: mock(),
    replace: mock(),
    refresh: mock(),
    back: mock(),
    forward: mock(),
    prefetch: mock(),
  }),
}))

// Route metadata needs a translation catalog without Next's request context.
mock.module('next-intl/server', () => ({
  getTranslations:
    async (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const path = namespace ? `${namespace}.${key}` : key
      const value = path
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
      if (typeof value !== 'string') throw new Error(`Missing message: ${path}`)
      return values
        ? value.replace(/\{(\w+)\}/g, (raw, name) => (name in values ? String(values[name]) : raw))
        : value
    },
  getLocale: async () => 'en',
  getMessages: async () => en,
}))

// Testing Library uses Jest's timer interface to advance a faked clock in waitFor.
jest.advanceTimersByTime = (ms) => {
  vi.advanceTimersByTime(ms)
  return nativeVi
}
Object.defineProperty(globalThis, 'jest', { configurable: true, value: jest })

const { cleanup } = await import('@testing-library/react/pure')
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
