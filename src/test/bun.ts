import { jest, vi as nativeVi } from 'bun:test'
import { install, type Clock, type Config, type FakeMethod } from '@sinonjs/fake-timers'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'bun:test' {
  interface Matchers<T = unknown> extends TestingLibraryMatchers<T, void> {
    toHaveBeenCalledExactlyOnceWith(...args: unknown[]): void
  }
}

type Callable = (...args: never[]) => unknown

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test } from 'bun:test'

const globals = new Map<object, Map<PropertyKey, PropertyDescriptor | undefined>>()
const env = new Map<string, string | undefined>()
const restoreAccessors = new Set<() => void>()
const nextTurn = setImmediate
let clock: Clock | undefined
// React act() drains work via node:timers.setImmediate; keep that queue live.
const toFake: FakeMethod[] = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'Date',
  'performance',
]

function fakeClock() {
  if (!clock) throw new Error('Enable fake timers before advancing the clock')
  return clock
}

function stubProperty(target: object, key: PropertyKey, value: unknown) {
  let saved = globals.get(target)
  if (!saved) {
    saved = new Map()
    globals.set(target, saved)
  }
  if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(target, key))
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
}

function unstubAllGlobals() {
  for (const [target, saved] of globals) {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
  }
  globals.clear()
}

function spyOn<T extends object, K extends keyof T>(
  target: T,
  key: K,
): ReturnType<typeof nativeVi.spyOn<T, K>>
function spyOn<T extends object, K extends keyof T>(
  target: T,
  key: K,
  access: 'get',
): ReturnType<typeof nativeVi.fn<() => T[K]>>
function spyOn<T extends object, K extends keyof T>(
  target: T,
  key: K,
  access: 'set',
): ReturnType<typeof nativeVi.fn<(value: T[K]) => void>>
function spyOn<T extends object, K extends keyof T>(target: T, key: K, access?: 'get' | 'set') {
  if (!access) return nativeVi.spyOn(target, key)
  const own = Object.getOwnPropertyDescriptor(target, key)
  let source = own
  for (
    let parent = Object.getPrototypeOf(target);
    !source && parent;
    parent = Object.getPrototypeOf(parent)
  ) {
    source = Object.getOwnPropertyDescriptor(parent, key)
  }
  const original = source?.[access]
  if (!original) throw new TypeError(`Missing accessor: ${String(key)}`)
  const spy = nativeVi.fn(original)
  Object.defineProperty(target, key, { ...source, configurable: true, [access]: spy })
  const restore = () => {
    if (own) Object.defineProperty(target, key, own)
    else Reflect.deleteProperty(target, key)
    restoreAccessors.delete(restore)
  }
  restoreAccessors.add(restore)
  Object.defineProperty(spy, 'mockRestore', { value: restore })
  return spy
}

function restoreAllMocks() {
  for (const restore of restoreAccessors) restore()
  nativeVi.restoreAllMocks()
}

export const vi = {
  clearAllMocks: nativeVi.clearAllMocks,
  mock: nativeVi.mock,
  spyOn,
  restoreAllMocks,
  fn<T extends Callable = jest.Mock>(implementation?: T) {
    return nativeVi.fn<(...args: Parameters<T>) => ReturnType<T>>(
      implementation as ((...args: Parameters<T>) => ReturnType<T>) | undefined,
    )
  },
  mocked<T extends Callable>(value: T) {
    return value as unknown as ReturnType<
      typeof nativeVi.fn<(...args: Parameters<T>) => ReturnType<T>>
    >
  },
  async mockModule(path: string, factory: (importOriginal: <T>() => Promise<T>) => unknown) {
    const exports = await factory(async <T>() => ({ ...(await import(path)) }) as T)
    nativeVi.mock(path, () => exports)
  },
  useFakeTimers(options?: Config) {
    if (!clock)
      clock = install({ now: Date.now(), shouldClearNativeTimers: true, toFake, ...options })
  },
  useRealTimers() {
    clock?.uninstall()
    clock = undefined
    jest.setSystemTime()
  },
  getTimerCount: () => fakeClock().countTimers(),
  setSystemTime(now: number | Date) {
    if (clock) clock.setSystemTime(now)
    else jest.setSystemTime(now)
  },
  advanceTimersByTime: (ms: number) => fakeClock().tick(ms),
  advanceTimersByTimeAsync: (ms: number) => fakeClock().tickAsync(ms),
  runAllTimersAsync: () => fakeClock().runAllAsync(),
  resetModules() {
    for (const id of Object.keys(require.cache)) {
      if (
        /\/src\/(?!test\/)/.test(id) &&
        !id.includes('/node_modules/') &&
        !/\.test\.[cm]?[jt]sx?$/.test(id)
      ) {
        delete require.cache[id]
      }
    }
  },
  setConfig: ({ testTimeout }: { testTimeout: number }) => jest.setTimeout(testTimeout),
  dynamicImportSettled: () => new Promise<void>((resolve) => nextTurn(resolve)),
  stubGlobal(key: string, value: unknown) {
    const browser = globalThis.window
    stubProperty(globalThis, key, value)
    if (browser && key !== 'window') stubProperty(browser, key, value)
  },
  unstubAllGlobals,
  stubEnv(key: string, value: string | undefined) {
    if (!env.has(key)) env.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  },
  unstubAllEnvs() {
    for (const [key, value] of env) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    env.clear()
  },
}
