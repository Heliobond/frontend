import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@/test/render'
import { HelioWebGL } from './HelioWebGL'

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
    }) as any)
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
