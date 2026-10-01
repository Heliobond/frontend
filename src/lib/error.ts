export interface ApiErrorShape {
  code?: string
  message?: string
  status?: number
  details?: Record<string, unknown>
  retryable?: boolean
  cause?: unknown
}

export type ApiErrorPayload =
  ApiErrorShape | { error?: ApiErrorShape | string } | string | Error | null | undefined

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStatus(status: unknown): number | undefined {
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined
}

function normalizeCode(code: unknown, fallback: string): string {
  if (typeof code === 'string' && code.trim().length > 0) return code.trim()
  return fallback
}

function normalizeMessage(message: unknown, fallback: string): string {
  if (typeof message === 'string' && message.trim().length > 0) return message.trim()
  return fallback
}

function normalizeDetails(details: unknown): Record<string, unknown> {
  if (isPlainObject(details)) return details
  return {}
}

function extractPayload(payload: unknown): ApiErrorShape {
  if (payload instanceof Error) {
    return {
      code: 'unknown_error',
      message: payload.message || 'Something went wrong',
      details: { name: payload.name },
      cause: payload.cause,
    }
  }

  if (typeof payload === 'string') {
    return {
      code: 'unknown_error',
      message: payload,
    }
  }

  if (!isPlainObject(payload)) {
    return {
      code: 'unknown_error',
      message: 'Something went wrong',
    }
  }

  const nestedError = isPlainObject(payload.error) ? payload.error : undefined
  const nestedMessage = typeof payload.error === 'string' ? payload.error : undefined

  const status = normalizeStatus(payload.status ?? nestedError?.status)
  const code = normalizeCode(payload.code ?? nestedError?.code, 'unknown_error')
  const message = normalizeMessage(
    payload.message ?? nestedError?.message ?? nestedMessage,
    'Something went wrong',
  )

  return {
    code,
    message,
    status,
    details: normalizeDetails(payload.details ?? nestedError?.details),
    retryable:
      typeof payload.retryable === 'boolean'
        ? payload.retryable
        : isRetryableStatus(status) || code.includes('network') || code.includes('timeout'),
    cause: payload.cause ?? nestedError?.cause,
  }
}

function isRetryableStatus(status?: number): boolean {
  return status === undefined ? false : status === 408 || status === 429 || status >= 500
}

export class ApiError extends Error {
  readonly code: string
  readonly status?: number
  readonly details: Record<string, unknown>
  readonly retryable: boolean
  readonly cause?: unknown

  constructor(payload: ApiErrorPayload = {}, fallbackMessage = 'Something went wrong') {
    const normalized = extractPayload(payload)
    const message = normalizeMessage(normalized.message ?? fallbackMessage, fallbackMessage)
    super(message)

    this.name = 'ApiError'
    this.code = normalizeCode(normalized.code, 'unknown_error')
    this.status = normalizeStatus(normalized.status)
    this.details = normalizeDetails(normalized.details)
    this.retryable =
      typeof normalized.retryable === 'boolean'
        ? normalized.retryable
        : isRetryableStatus(this.status)
    this.cause = normalized.cause
  }
}

export function normalizeApiError(
  payload: ApiErrorPayload = {},
  fallbackMessage = 'Something went wrong',
): ApiError {
  return new ApiError(payload, fallbackMessage)
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}
