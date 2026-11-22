export interface VirtualRange {
  start: number
  end: number
  topPadding: number
  bottomPadding: number
}

/** Compute a bounded render window for a fixed-height list with overscan. */
export function getVirtualRange(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 2,
): VirtualRange {
  if (![itemCount, scrollTop, viewportHeight, rowHeight, overscan].every(Number.isFinite)) {
    throw new TypeError('virtual list dimensions must be finite numbers')
  }
  if (itemCount < 0 || scrollTop < 0 || viewportHeight < 0 || rowHeight <= 0 || overscan < 0) {
    throw new RangeError('virtual list dimensions are outside their valid range')
  }

  // A scroll offset kept from a longer feed (or restored after a refresh) can
  // point past the end of a shortened list. Clamp it to what can actually be
  // scrolled so the window lands on real rows instead of blank top padding.
  const maxScrollTop = Math.max(0, itemCount * rowHeight - viewportHeight)
  const boundedScrollTop = Math.min(scrollTop, maxScrollTop)

  // Keep the window inside the current rows even for a zero-height viewport.
  const start = Math.min(
    itemCount,
    Math.max(0, Math.floor(boundedScrollTop / rowHeight) - overscan),
  )
  const end = Math.min(
    itemCount,
    Math.max(start, Math.ceil((boundedScrollTop + viewportHeight) / rowHeight) + overscan),
  )
  return {
    start,
    end,
    topPadding: start * rowHeight,
    bottomPadding: (itemCount - end) * rowHeight,
  }
}
