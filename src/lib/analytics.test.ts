import { afterEach, describe, expect, it, vi } from 'vitest'
import { track } from './analytics'

describe('track', () => {
  afterEach(() => {
    localStorage.clear()
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: null })
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: undefined,
    })
    vi.unstubAllGlobals()
  })

  it('forwards events to the analytics client', async () => {
    const analytics = { track: vi.fn() }
    vi.stubGlobal('analytics', analytics)
    localStorage.setItem('hb-telemetry-consent', 'granted')

    await expect(track('page_view', { path: '/explore' })).resolves.toBeUndefined()
    expect(analytics.track).toHaveBeenCalledWith('page_view', { path: '/explore' })
  })

  it.each([
    ['denied consent', 'denied'],
    ['missing consent', null],
  ])('does not forward events with %s', async (_label, consent) => {
    const analytics = { track: vi.fn() }
    vi.stubGlobal('analytics', analytics)
    if (consent) localStorage.setItem('hb-telemetry-consent', consent)

    await expect(track('page_view')).resolves.toBeUndefined()
    expect(analytics.track).not.toHaveBeenCalled()
  })

  it('does not forward events when DNT or GPC is enabled', async () => {
    const analytics = { track: vi.fn() }
    vi.stubGlobal('analytics', analytics)
    localStorage.setItem('hb-telemetry-consent', 'granted')

    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' })
    await track('page_view')
    expect(analytics.track).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: null })
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    })
    await track('page_view')
    expect(analytics.track).not.toHaveBeenCalled()
  })

  it('starts forwarding after consent is granted without a reload', async () => {
    const analytics = { track: vi.fn() }
    vi.stubGlobal('analytics', analytics)

    await track('page_view')
    localStorage.setItem('hb-telemetry-consent', 'granted')
    await track('page_view')

    expect(analytics.track).toHaveBeenCalledTimes(1)
  })

  it('swallows synchronous tracker failures', async () => {
    vi.stubGlobal('analytics', {
      track: vi.fn(() => {
        throw new Error('analytics unavailable')
      }),
    })

    await expect(track('page_view')).resolves.toBeUndefined()
  })

  it('swallows rejected tracker promises', async () => {
    vi.stubGlobal('analytics', {
      track: vi.fn(() => Promise.reject(new Error('analytics unavailable'))),
    })

    await expect(track('page_view')).resolves.toBeUndefined()
  })
})
