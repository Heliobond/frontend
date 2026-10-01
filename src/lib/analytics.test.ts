import { afterEach, describe, expect, it, vi } from 'vitest'
import { track } from './analytics'

describe('track', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards events to the analytics client', async () => {
    const analytics = { track: vi.fn() }
    vi.stubGlobal('analytics', analytics)

    await expect(track('page_view', { path: '/explore' })).resolves.toBeUndefined()
    expect(analytics.track).toHaveBeenCalledWith('page_view', { path: '/explore' })
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
