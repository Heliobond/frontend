import { describe, expect, it } from 'vitest'
import { getVirtualRange } from './virtualRange'

describe('getVirtualRange', () => {
  it('renders only the visible items plus overscan for large feeds', () => {
    const range = getVirtualRange(5000, 4000 * 84, 504, 84, 2)
    expect(range.start).toBe(3998)
    expect(range.end).toBe(4008)
    expect(range.end - range.start).toBe(10)
    expect(range.topPadding).toBe(3998 * 84)
    expect(range.bottomPadding).toBe((5000 - 4008) * 84)
  })

  it('clamps the render range at either end of the feed', () => {
    expect(getVirtualRange(5, 0, 200, 80)).toEqual({
      start: 0,
      end: 5,
      topPadding: 0,
      bottomPadding: 0,
    })
  })

  it('rejects invalid dimensions', () => {
    expect(() => getVirtualRange(5, 0, 200, 0)).toThrow(RangeError)
  })
})
