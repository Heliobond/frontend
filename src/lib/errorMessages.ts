import { contractErrorMessageEn } from './contractErrors'

/*
 * Maps technical error codes and enum values to user-friendly messages.
 * Never surface raw codes like 'insufficient_balance' to users.
 */

const ERROR_CODE_MAP: Record<string, string> = {
  insufficient_balance: 'Not enough funds - your balance is too low for this amount.',
  insufficient_funds: 'Not enough funds - your balance is too low for this amount.',
  amount_too_low: 'Enter an amount of at least 1 USDC.',
  amount_exceeds_balance: 'Not enough funds - try a smaller amount or use Max.',
  invalid_amount: 'Please enter a valid amount.',
  wallet_not_connected: 'Please connect your wallet first.',
  timeout: 'Connection timed out - please try again.',
  network_error: 'Network issue - please check your connection and try again.',
  stellar_unreachable: 'Cannot reach Stellar network - showing cached data.',
  simulation_failed: 'Could not estimate the transaction - please try again.',
  tx_failed: 'Transaction did not go through - please try again.',
  memo_too_long: 'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
  err_memo_too_long: 'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
  memo_length_exceeded: 'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
  invalid_memo: 'Invalid memo — text memos must be 28 bytes or fewer.',
  tx_malformed: 'Transaction malformed — please check your transaction inputs and memo.',
  op_malformed: 'Transaction operation malformed — please check your inputs.',
  invalid_address: 'Invalid Stellar address — please check the address for typos.',
  invalid_destination: 'Invalid destination address — please check the address for typos.',
  invalid_public_key: 'Invalid public key — please check the address for typos.',
  invalid_stellar_address: 'Invalid Stellar address — please check the address for typos.',
  address_checksum_failed: 'Invalid Stellar address checksum — please check for typos.',
  internal_server_error: 'We are having trouble right now - please try again shortly.',
  server_error: 'We are having trouble right now - please try again shortly.',
  internal_error: 'Something went wrong on our side - please try again.',
  unexpected_error: 'Something went wrong - please try again.',
  slippage_limit_exceeded: 'Price moved unfavorably — please refresh the quote and try again.',
  '500': 'We are having trouble right now - please try again shortly.',
  '502': 'We are having trouble right now - please try again shortly.',
  '503': 'We are having trouble right now - please try again shortly.',
}

const FALLBACK_MESSAGE = 'Something went wrong - please try again.'

const STELLAR_UNREACHABLE_MESSAGE = ERROR_CODE_MAP.stellar_unreachable
const MEMO_TOO_LONG_MESSAGE = ERROR_CODE_MAP.memo_too_long
const INVALID_ADDRESS_MESSAGE = ERROR_CODE_MAP.invalid_address

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

function normalizeCode(code: string): string {
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

export function getFriendlyErrorMessage(codeOrMessage: string): string {
  if (!codeOrMessage) return FALLBACK_MESSAGE
  // Soroban `Error(Contract, #N)` failures get a specific message (#610).
  const contractMessage = contractErrorMessageEn(codeOrMessage)
  if (contractMessage) return contractMessage
  const normalized = normalizeCode(codeOrMessage)
  if (ERROR_CODE_MAP[normalized]) return ERROR_CODE_MAP[normalized]

  // If the error message describes a memo issue, return a clear memo error.
  if (looksLikeMemoError(codeOrMessage)) {
    return MEMO_TOO_LONG_MESSAGE
  }

  // If the error message describes an address or public key issue, return a clear address error.
  if (looksLikeAddressError(codeOrMessage)) {
    return INVALID_ADDRESS_MESSAGE
  }

  // If the error looks like a network/connection issue, degrade gracefully.
  if (looksLikeNetworkError(codeOrMessage)) {
    return STELLAR_UNREACHABLE_MESSAGE
  }

  return FALLBACK_MESSAGE
}

export function parseAndFriendlyError(error: unknown): string {
  const contractMessage = contractErrorMessageEn(error)
  if (contractMessage) return contractMessage
  const code = extractCodeFromError(error)
  if (code) return getFriendlyErrorMessage(code)
  if (error instanceof Error) return getFriendlyErrorMessage(error.message)
  if (typeof error === 'string') return getFriendlyErrorMessage(error)
  return FALLBACK_MESSAGE
}
