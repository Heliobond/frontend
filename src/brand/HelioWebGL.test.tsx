import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@/test/render'
import { HelioWebGL, isConstrainedCanvas, shouldAnimateHelio } from './HelioWebGL'

/**
 * The WebGL canvas is loaded through next/dynamic and pulls in three/R3F, which
 * jsdom can't run. Swap it for a probe that records the props it receives, so we
 * can assert on the render-loop flags (notably `animate`) the component
 * computes. `vi.hoisted` keeps the probe alive above the hoisted vi.mock call.
 */
const canvasProbe = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}))

vi.mock('next/dynamic', () => ({
  default: () => (props: Record<string, unknown>) => {
    canvasProbe.props = props
    return null
  },
}))

describe('HelioWebGL tab visibility, offscreen & motion behavior', () => {
  let visibilityState = 'visible'

  // Controllable IntersectionObserver — jsdom has none, and we need to drive the
  // offscreen transition by hand.
  type IOCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void
  let ioCallback: IOCallback | null = null
  let observedElements: Element[] = []
  const disconnectSpy = vi.fn()

  class MockIntersectionObserver {
    constructor(callback: IOCallback) {
      ioCallback = callback
    }
    observe(el: Element) {
      observedElements.push(el)
    }
    unobserve() {}
    disconnect() {
      disconnectSpy()
    }
    takeRecords() {
      return []
    }
  }

  const setIntersecting = (isIntersecting: boolean) => {
    act(() => {
      ioCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
  }

  beforeEach(() => {
    visibilityState = 'visible'
    canvasProbe.props = null
    ioCallback = null
    observedElements = []
    disconnectSpy.mockClear()
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

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    // Mock HTMLCanvasElement.prototype.getContext to simulate WebGL availability
    const getContext = ((contextId: string) => {
      if (contextId === 'webgl2' || contextId === 'webgl' || contextId === 'experimental-webgl') {
        return {} as unknown as RenderingContext
      }
      return null
    }) as unknown as HTMLCanvasElement['getContext']
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(getContext)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

  it('pauses the render loop while the orb is offscreen and resumes when it returns', () => {
    render(<HelioWebGL size={200} motes={10} />)

    // The container is observed and the loop is running while on screen.
    expect(observedElements).toHaveLength(1)
    expect(canvasProbe.props?.animate).toBe(true)

    // Scrolled out of the viewport → the loop pauses.
    setIntersecting(false)
    expect(canvasProbe.props?.animate).toBe(false)

    // Scrolled back in → the loop resumes.
    setIntersecting(true)
    expect(canvasProbe.props?.animate).toBe(true)
  })

  it('stops observing the container when unmounted', () => {
    const { unmount } = render(<HelioWebGL size={200} motes={10} />)
    unmount()
    expect(disconnectSpy).toHaveBeenCalled()
  })
})

describe('shouldAnimateHelio', () => {
  it('animates only when motion is allowed, the tab is visible and the orb is on screen', () => {
    expect(shouldAnimateHelio({ reducedMotion: false, tabVisible: true, onScreen: true })).toBe(
      true,
    )
  })

  it('pauses when the orb scrolls offscreen', () => {
    expect(shouldAnimateHelio({ reducedMotion: false, tabVisible: true, onScreen: false })).toBe(
      false,
    )
  })

  it('pauses when the tab is hidden', () => {
    expect(shouldAnimateHelio({ reducedMotion: false, tabVisible: false, onScreen: true })).toBe(
      false,
    )
  })

  it('pauses under reduced motion even when visible and on screen', () => {
    expect(shouldAnimateHelio({ reducedMotion: true, tabVisible: true, onScreen: true })).toBe(
      false,
    )
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
