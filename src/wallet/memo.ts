/**
 * Maximum byte length allowed for Stellar MEMO_TEXT field.
 * Per Stellar protocol specification, text memos are limited to 28 bytes.
 */
export const MAX_STELLAR_MEMO_LENGTH = 28

export interface MemoValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate Stellar memo text length prior to building or submitting transactions.
 *
 * @param memo Optional memo string
 * @returns Validation result with descriptive error if byte length > 28
 */
export function validateStellarMemo(memo?: string): MemoValidationResult {
  if (!memo) return { valid: true }

  const byteLength = new TextEncoder().encode(memo).length
  if (byteLength > MAX_STELLAR_MEMO_LENGTH) {
    return {
      valid: false,
      error: `Memo text cannot exceed ${MAX_STELLAR_MEMO_LENGTH} bytes (${byteLength} bytes provided).`,
    }
  }

  return { valid: true }
}
