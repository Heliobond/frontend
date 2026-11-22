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

  it('clamps a stale scroll offset to the end of a shortened feed', () => {
    // Offset kept from a 5000-row feed, but the list now holds 20 rows.
    const range = getVirtualRange(20, 4000 * 84, 504, 84, 2)
    expect(range.start).toBe(12)
    expect(range.end).toBe(20)
    expect(range.start).toBeLessThan(range.end)
    expect(range.topPadding).toBe(12 * 84)
    expect(range.bottomPadding).toBe(0)
  })

  it('renders real rows at the end of a shortened feed instead of blank padding', () => {
    const itemCount = 10
    const rowHeight = 84
    const range = getVirtualRange(itemCount, 9000, 504, rowHeight, 2)
    expect(range.start).toBeLessThan(range.end)
    expect(range.end).toBe(itemCount)
    expect(range.topPadding + range.bottomPadding).toBeLessThan(itemCount * rowHeight)
  })

  it('always gives an empty feed zero spacer height', () => {
    expect(getVirtualRange(0, 9000, 504, 84, 2)).toEqual({
      start: 0,
      end: 0,
      topPadding: 0,
      bottomPadding: 0,
    })
  })

  it('rejects invalid dimensions', () => {
    expect(() => getVirtualRange(5, 0, 200, 0)).toThrow(RangeError)
  })
})
