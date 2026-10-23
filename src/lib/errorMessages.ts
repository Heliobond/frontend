import { isAppError } from './appError'

/*
 * Maps technical error codes and enum values to catalog keys under the
 * `Errors` namespace. Never surface raw codes like 'insufficient_balance'
 * to users — translate the key in the UI with `t(\`Errors.${code}\`)`.
 */

export const ERROR_CODE_MAP: Record<string, string> = {
  insufficient_balance: 'insufficientBalance',
  insufficient_funds: 'insufficientBalance',
  amount_too_low: 'amountTooLow',
  amount_exceeds_balance: 'amountExceedsBalance',
  invalid_amount: 'invalidAmount',
  wallet_not_connected: 'walletNotConnected',
  timeout: 'timeout',
  network_error: 'networkError',
  stellar_unreachable: 'stellarUnreachable',
  simulation_failed: 'simulationFailed',
  tx_failed: 'txFailed',
  memo_too_long: 'memoTooLong',
  err_memo_too_long: 'memoTooLong',
  memo_length_exceeded: 'memoTooLong',
  invalid_memo: 'invalidMemo',
  tx_malformed: 'txMalformed',
  op_malformed: 'opMalformed',
  invalid_address: 'invalidAddress',
  invalid_destination: 'invalidAddress',
  invalid_public_key: 'invalidAddress',
  invalid_stellar_address: 'invalidAddress',
  address_checksum_failed: 'addressChecksumFailed',
  internal_server_error: 'serverError',
  server_error: 'serverError',
  internal_error: 'internalError',
  unexpected_error: 'unexpectedError',
  slippage_limit_exceeded: 'slippageLimitExceeded',
  '500': 'serverError',
  '502': 'serverError',
  '503': 'serverError',
}

export const FALLBACK_ERROR_CODE = 'unexpectedError'

// Keywords that indicate a network connectivity issue with the Stellar node.
const NETWORK_ERROR_PATTERNS = [
  'network',
  'socket',
  'fetch',
  'connection',
  'connect',
  'unreachable',
  'refused',
  'dns',
  'timed out',
  'timeout',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_NAME_NOT_RESOLVED',
  'socket hang up',
  'network error',
  'fetch failed',
  'request failed',
  'aborted',
  'abort',
]

function looksLikeMemoError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('memo') &&
    (lower.includes('too long') ||
      lower.includes('length') ||
      lower.includes('exceed') ||
      lower.includes('28') ||
      lower.includes('byte') ||
      lower.includes('malformed'))
  )
}

function looksLikeAddressError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    (lower.includes('stellar') ||
      lower.includes('destination') ||
      lower.includes('public key') ||
      lower.includes('address')) &&
    (lower.includes('checksum') ||
      lower.includes('typo') ||
      lower.includes('must start with g') ||
      lower.includes('invalid stellar public address'))
  )
}

export function normalizeCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function extractCodeFromError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const obj = error as Record<string, unknown>
  // If it looks like an Axios/Axios-like error with a response
  if (obj.response) {
    const response = obj.response as Record<string, unknown>
    const status = response.status
    if (typeof status === 'number' && status >= 500) {
      return String(status)
    }
    const data = response.data
    if (data && typeof data === 'object') {
      const { code, message } = data as Record<string, unknown>
      if (typeof code === 'string') return code
      if (typeof message === 'string') return message
    } else if (typeof data === 'string' && data.trim()) {
      return data
    }
    if (typeof status === 'number') return String(status)
  }
  if (typeof obj.code === 'string') return obj.code
  if (typeof obj.message === 'string') return obj.message
  return null
}

function looksLikeNetworkError(message: string): boolean {
  const lower = message.toLowerCase()
  return NETWORK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()))
}

/**
 * Resolves a technical code or raw error text to a stable `Errors` catalog key.
 * The UI translates the key — this module never returns user-facing copy.
 */
export function getErrorCode(codeOrMessage: string): string {
  if (!codeOrMessage) return FALLBACK_ERROR_CODE
  const normalized = normalizeCode(codeOrMessage)
  if (ERROR_CODE_MAP[normalized]) return ERROR_CODE_MAP[normalized]

  // If the error message describes a memo issue, return a clear memo key.
  if (looksLikeMemoError(codeOrMessage)) {
    return ERROR_CODE_MAP.memo_too_long
  }

  // If the error message describes an address or public key issue, return a clear address key.
  if (looksLikeAddressError(codeOrMessage)) {
    return ERROR_CODE_MAP.invalid_address
  }

  // If the error looks like a network/connection issue, degrade gracefully.
  if (looksLikeNetworkError(codeOrMessage)) {
    return ERROR_CODE_MAP.stellar_unreachable
  }

  return FALLBACK_ERROR_CODE
}

/** Resolves an unknown thrown value to a stable `Errors` catalog key (#901). */
export function parseErrorCode(error: unknown): string {
  if (isAppError(error)) return error.code
  const code = extractCodeFromError(error)
  if (code) return getErrorCode(code)
  if (error instanceof Error) return getErrorCode(error.message)
  if (typeof error === 'string') return getErrorCode(error)
  return FALLBACK_ERROR_CODE
}
