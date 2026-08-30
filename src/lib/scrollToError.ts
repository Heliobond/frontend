export interface ScrollToErrorOptions {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  focus?: boolean;
}

export function scrollToFirstError(
  container: HTMLElement | Document = document,
  options: ScrollToErrorOptions = {}
): boolean {
  const { behavior = "smooth", block = "center", focus = true } = options;
  const root = container instanceof Document ? container : container;
  const selector = '[aria-invalid="true"], [data-invalid="true"], .field-error, [role="alert"]';
  const el = root.querySelector(selector) as HTMLElement | null;
  if (!el) return false;

  const target = (el.closest("[data-field-wrapper]") as HTMLElement) || el;
  target.scrollIntoView({ behavior, block });

  if (focus) {
    const focusable = target.querySelector<HTMLElement>("input, select, textarea, button") || (target as HTMLElement);
    if (focusable && typeof focusable.focus === "function") {
      setTimeout(() => focusable.focus({ preventScroll: true } as any), 300);
    }
  }

  try {
    if (typeof window !== "undefined" && "Toast" in window) {
      // toast fallback is handled by caller
    }
  } catch {}
  return true;
}

export function scrollToField(fieldId: string, options: ScrollToErrorOptions = {}): boolean {
  const { behavior = "smooth", block = "center", focus = true } = options;
  const el = document.getElementById(fieldId);
  if (!el) return false;
  el.scrollIntoView({ behavior, block });
  if (focus && typeof (el as HTMLElement).focus === "function") {
    setTimeout(() => (el as HTMLElement).focus({ preventScroll: true } as any), 300);
  }
  return true;
}
