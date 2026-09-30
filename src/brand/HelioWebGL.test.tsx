import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@/test/render'
import { HelioWebGL, isConstrainedCanvas } from './HelioWebGL'

describe('HelioWebGL tab visibility & motion behavior', () => {
  let visibilityState = 'visible'

  beforeEach(() => {
    visibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    })

    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    // Mock HTMLCanvasElement.prototype.getContext to simulate WebGL availability
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((contextId: string) => {
      if (contextId === 'webgl2' || contextId === 'webgl' || contextId === 'experimental-webgl') {
        return {} as unknown as RenderingContext
      }
      return null
    }) as HTMLCanvasElement['getContext'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders container when WebGL is available', async () => {
    const { container } = render(<HelioWebGL size={200} motes={10} />)
    expect(container.querySelector('div[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('listens for visibilitychange events to pause and resume rendering', async () => {
    const addEventSpy = vi.spyOn(document, 'addEventListener')
    const removeEventSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = render(<HelioWebGL size={200} motes={10} />)

    expect(addEventSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    // Simulate tab becoming hidden
    visibilityState = 'hidden'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Simulate tab becoming visible again
    visibilityState = 'visible'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    unmount()
    expect(removeEventSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})

/**
 * jsdom's navigator exposes none of the client hints we read, and its
 * defaults (e.g. `hardwareConcurrency`) are unreliable across environments.
 * Each test stubs exactly the hints it cares about and restores the real
 * navigator afterwards.
 */
type NavHints = {
  connection?: { saveData?: boolean; effectiveType?: string }
  deviceMemory?: number
  hardwareConcurrency?: number
}

const stubNavigator = (hints: NavHints) => {
  vi.stubGlobal('navigator', { ...hints })
}

describe('isConstrainedCanvas', () => {
  it('is false on a capable device with no data-saving', () => {
    stubNavigator({
      connection: { saveData: false, effectiveType: '4g' },
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })
    expect(isConstrainedCanvas()).toBe(false)
  })

  it('is true when Save-Data is enabled', () => {
    stubNavigator({
      connection: { saveData: true, effectiveType: '3g' },
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })
    expect(isConstrainedCanvas()).toBe(true)
  })

  it('is true on low device memory (≤ 4 GiB)', () => {
    stubNavigator({ deviceMemory: 4, hardwareConcurrency: 8 })
    expect(isConstrainedCanvas()).toBe(true)
  })

  it('is false with 8 GiB of device memory', () => {
    stubNavigator({ deviceMemory: 8, hardwareConcurrency: 8 })
    expect(isConstrainedCanvas()).toBe(false)
  })

  it('is true on few CPU cores (≤ 4)', () => {
    stubNavigator({ deviceMemory: 8, hardwareConcurrency: 4 })
    expect(isConstrainedCanvas()).toBe(true)
  })

  it('is false with 8 CPU cores', () => {
    stubNavigator({ hardwareConcurrency: 8 })
    expect(isConstrainedCanvas()).toBe(false)
  })

  it('is true on a slow-2g / 2g effective connection', () => {
    stubNavigator({ connection: { saveData: false, effectiveType: '2g' }, hardwareConcurrency: 8 })
    expect(isConstrainedCanvas()).toBe(true)
    stubNavigator({
      connection: { saveData: false, effectiveType: 'slow-2g' },
      hardwareConcurrency: 8,
    })
    expect(isConstrainedCanvas()).toBe(true)
  })

  it('is false on a 3g connection with capable hardware and no Save-Data', () => {
    stubNavigator({ connection: { saveData: false, effectiveType: '3g' }, hardwareConcurrency: 8 })
    expect(isConstrainedCanvas()).toBe(false)
  })

  it('is false when no client hints are exposed at all', () => {
    stubNavigator({})
    expect(isConstrainedCanvas()).toBe(false)
  })
})
