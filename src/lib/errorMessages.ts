/**
 * Maps technical error codes and enum values to user-friendly messages.
 * Never surface raw codes like 'insufficient_balance' to users.
 */

const ERROR_CODE_MAP: Record<string, string> = {
  insufficient_balance: 'Not enough funds — your balance is too low for this amount.',
  insufficient_funds: 'Not enough funds — your balance is too low for this amount.',
  amount_too_low: 'Enter an amount of at least 1 USDC.',
  amount_exceeds_balance: 'Not enough funds — try a smaller amount or use Max.',
  invalid_amount: 'Please enter a valid amount.',
  wallet_not_connected: 'Please connect your wallet first.',
  timeout: 'Connection timed out — please try again.',
  network_error: 'Network issue — please check your connection and try again.',
  simulation_failed: 'Could not estimate the transaction — please try again.',
  tx_failed: 'Transaction did not go through — please try again.',
}

const FALLBACK_MESSAGE = 'Something went wrong — please try again.'

function normalizeCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function getFriendlyErrorMessage(codeOrMessage: string): string {
  if (!codeOrMessage) return FALLBACK_MESSAGE
  const normalized = normalizeCode(codeOrMessage)
  if (ERROR_CODE_MAP[normalized]) return ERROR_CODE_MAP[normalized]
  // If message already looks friendly (contains spaces and no underscores), return as-is
  if (!codeOrMessage.includes('_') && codeOrMessage.length > 10) return codeOrMessage
  // Try to humanize snake_case codes
  if (codeOrMessage.includes('_')) {
    return codeOrMessage
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      + ' — please try again.'
  }
  return codeOrMessage
}

export function parseAndFriendlyError(error: unknown): string {
  if (error instanceof Error) return getFriendlyErrorMessage(error.message)
  if (typeof error === 'string') return getFriendlyErrorMessage(error)
  return FALLBACK_MESSAGE
}
