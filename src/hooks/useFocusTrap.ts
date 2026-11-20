import { useEffect, useEffectEvent, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface FocusTrap {
  container: HTMLElement
  previous: HTMLElement | null
  layer: number
  focusInside: () => void
}

// Highest layer wins. For dialogs on the same layer, the latest one wins.
const traps: FocusTrap[] = []

/** Keep keyboard and programmatic focus inside an open modal and restore it on close. */
export function useFocusTrap<T extends HTMLElement>(
  open: boolean,
  containerRef: RefObject<T | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
  onEscape?: () => void,
  layer = 0,
) {
  const handleEscape = useEffectEvent((event: KeyboardEvent) => {
    if (!onEscape) return
    event.preventDefault()
    event.stopPropagation()
    onEscape()
  })

  useEffect(() => {
    const container = containerRef.current
    if (!open || !container) return

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let lastInside: HTMLElement | null = null
    const focusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) =>
          !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
          element.getAttribute('aria-disabled') !== 'true',
      )
    const focusInside = () => {
      if (lastInside && container.contains(lastInside)) {
        lastInside.focus()
        if (document.activeElement === lastInside) return
      }
      const target = initialFocusRef?.current ?? focusable()[0] ?? container
      target.focus()
    }

    const trap: FocusTrap = { container, previous, layer, focusInside }
    const above = traps.findIndex((other) => other.layer > layer)
    if (above === -1) {
      traps.push(trap)
    } else {
      trap.previous = traps[above].previous
      traps.splice(above, 0, trap)
    }
    const isForemost = () => traps.at(-1) === trap

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isForemost() || event.defaultPrevented) return
      if (event.key === 'Escape') {
        handleEscape(event)
        return
      }
      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (!isForemost()) return
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (container.contains(target)) {
        lastInside = target
        return
      }
      focusInside()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn, true)
    if (isForemost()) focusInside()

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      const wasForemost = isForemost()
      traps.splice(traps.indexOf(trap), 1)
      for (const other of traps) {
        if (container.contains(other.previous)) other.previous = trap.previous
      }
      if (!wasForemost) return

      const next = traps.at(-1)
      if (trap.previous?.isConnected && (!next || next.container.contains(trap.previous))) {
        trap.previous.focus()
      }
      if (next && !next.container.contains(document.activeElement)) next.focusInside()
    }
  }, [open, containerRef, initialFocusRef, layer])
}
