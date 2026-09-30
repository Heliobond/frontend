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

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(itemCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
  return {
    start,
    end,
    topPadding: start * rowHeight,
    bottomPadding: (itemCount - end) * rowHeight,
  }
}
