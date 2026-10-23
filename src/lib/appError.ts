/**
 * Application error carrying a stable `Errors` catalog key (#901).
 * Library and wallet modules throw these instead of English sentences so the
 * UI can translate `code` (with optional ICU `params`) in the active locale.
 */
export class AppError extends Error {
  readonly code: string
  readonly params?: Record<string, string | number>

  constructor(code: string, params?: Record<string, string | number>) {
    // `message` is the code itself — never user-facing English.
    super(code)
    this.name = 'AppError'
    this.code = code
    this.params = params
  }
}

/** True when `value` is an AppError. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}
