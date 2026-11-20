export interface ScrollToErrorOptions {
  behavior?: ScrollBehavior
  block?: ScrollLogicalPosition
  focus?: boolean
}

export function scrollToFirstError(
  container: HTMLElement | Document = document,
  options: ScrollToErrorOptions = {},
): boolean {
  const { behavior = 'smooth', block = 'center', focus = true } = options
  const root = container
  const invalidSelector = '[aria-invalid="true"], [data-invalid="true"]'
  const invalidField = root.querySelector(invalidSelector) as HTMLElement | null
  const errorMessage = root.querySelector('.field-error, [role="alert"]') as HTMLElement | null
  const el = invalidField ?? errorMessage
  if (!el) return false

  const target = (el.closest('[data-field-wrapper]') as HTMLElement) || el
  target.scrollIntoView?.({ behavior, block })

  if (focus) {
    const focusable =
      (target.matches('input, select, textarea, button, [tabindex]') ? target : null) ||
      target.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]') ||
      target
    if (focusable && typeof focusable.focus === 'function') {
      focusable.focus({ preventScroll: true })
    }
  }

  try {
    if (typeof window !== 'undefined' && 'Toast' in window) {
      // toast fallback is handled by caller
    }
  } catch {}
  return true
}

export function scrollToField(fieldId: string, options: ScrollToErrorOptions = {}): boolean {
  const { behavior = 'smooth', block = 'center', focus = true } = options
  const el = document.getElementById(fieldId)
  if (!el) return false
  el.scrollIntoView?.({ behavior, block })
  if (focus && typeof (el as HTMLElement).focus === 'function') {
    void (el as HTMLElement).focus({ preventScroll: true })
  }
  return true
}
