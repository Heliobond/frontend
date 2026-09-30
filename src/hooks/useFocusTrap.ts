import { useEffect, type RefObject } from 'react'

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

/** Keep keyboard and programmatic focus inside an open modal and restore it on close. */
export function useFocusTrap<T extends HTMLElement>(
  open: boolean,
  containerRef: RefObject<T | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
  onEscape?: () => void,
) {
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
    const focusFirst = () => {
      const target = initialFocusRef?.current ?? focusable()[0] ?? container
      target.focus()
      lastInside = target
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault()
        onEscape()
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
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (container.contains(target)) {
        lastInside = target
        return
      }
      ;(lastInside ?? initialFocusRef?.current ?? focusable()[0] ?? container).focus()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn, true)
    focusFirst()

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [open, containerRef, initialFocusRef, onEscape])
}
