import { StrKey } from '@stellar/stellar-sdk'
import { STELLAR_MAX_MEMO_TEXT_BYTES, type StellarMemoType } from '../types'

export { STELLAR_MAX_MEMO_TEXT_BYTES }
export type { StellarMemoType }

/** Maximum 64-bit unsigned integer value allowed for Stellar MEMO_ID. */
export const STELLAR_MAX_MEMO_ID = BigInt('18446744073709551615')

/** Stellar public address regex (56-character base32 starting with G). */
export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/

export interface AddressValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validates a Stellar public address (starts with G, 56 characters, valid base32, and valid CRC16 checksum).
 * Catches typos that length-only or regex-only checks miss.
 */
export function validateStellarAddress(
  address: string | null | undefined,
): AddressValidationResult {
  if (!address || typeof address !== 'string' || address.trim() === '') {
    return {
      valid: false,
      error: 'Invalid Stellar public address: address is required',
    }
  }

  const trimmed = address.trim()

  if (!STELLAR_ADDRESS_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Invalid Stellar public address (must start with G and be 56 characters)',
    }
  }

  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    return {
      valid: false,
      error: 'Invalid Stellar public address checksum (please check for typos)',
    }
  }

  return { valid: true }
}

/**
 * Returns true if the address is a valid Stellar public key with a valid checksum.
 */
export function isValidStellarAddress(address: string | null | undefined): boolean {
  return validateStellarAddress(address).valid
}

/** Alias for validateStellarAddress */
export const validatePublicKey = validateStellarAddress

/** Alias for isValidStellarAddress */
export const isValidPublicKey = isValidStellarAddress

/** 32-byte hexadecimal hash regex (64 hex characters). */
const HEX_32_BYTES_REGEX = /^[0-9a-fA-F]{64}$/

export interface MemoValidationResult {
  valid: boolean
  byteLength: number
  maxBytes: number
  error?: string
}

export interface StellarPaymentParams {
  amount: number
  destination?: string
  memo?: string
  memoType?: StellarMemoType
  balance?: number
  minAmount?: number
}

export interface StellarPaymentValidationResult {
  valid: boolean
  errors: {
    amount?: string
    destination?: string
    memo?: string
  }
}

/**
 * Calculates the UTF-8 byte length of a string.
 * Stellar memos are constrained by byte count, not character count.
 */
export function getMemoByteLength(memo: string | null | undefined): number {
  if (!memo) return 0
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(memo).length
  }
  // Fallback for environments where TextEncoder is not available
  return Buffer.from(memo, 'utf-8').length
}

/**
 * Validates the byte length of a Stellar text memo before submission.
 * Rejects any memo that exceeds maxBytes (default 28 bytes per Stellar protocol).
 */
export function validateMemoLength(
  memo: string | null | undefined,
  maxBytes: number = STELLAR_MAX_MEMO_TEXT_BYTES,
): MemoValidationResult {
  const byteLength = getMemoByteLength(memo)

  if (byteLength > maxBytes) {
    return {
      valid: false,
      byteLength,
      maxBytes,
      error: `Memo is too long: ${byteLength} bytes (maximum is ${maxBytes} bytes)`,
    }
  }

  return {
    valid: true,
    byteLength,
    maxBytes,
  }
}

/**
 * Validates a Stellar transaction memo according to its specified type.
 * Default type is 'text' (max 28 UTF-8 bytes).
 */
export function validateMemo(
  memo: string | null | undefined,
  type: StellarMemoType = 'text',
): MemoValidationResult {
  if (!memo || memo.trim() === '') {
    return {
      valid: true,
      byteLength: 0,
      maxBytes: STELLAR_MAX_MEMO_TEXT_BYTES,
    }
  }

  const trimmed = memo.trim()
  const byteLength = getMemoByteLength(trimmed)

  switch (type) {
    case 'text': {
      if (byteLength > STELLAR_MAX_MEMO_TEXT_BYTES) {
        return {
          valid: false,
          byteLength,
          maxBytes: STELLAR_MAX_MEMO_TEXT_BYTES,
          error: `Memo text is too long: ${byteLength} bytes (maximum is ${STELLAR_MAX_MEMO_TEXT_BYTES} bytes)`,
        }
      }
      return {
        valid: true,
        byteLength,
        maxBytes: STELLAR_MAX_MEMO_TEXT_BYTES,
      }
    }

    case 'id': {
      // Must be an unsigned 64-bit integer
      if (!/^\d+$/.test(trimmed)) {
        return {
          valid: false,
          byteLength,
          maxBytes: 20,
          error: 'Memo ID must be a non-negative integer',
        }
      }
      try {
        const idValue = BigInt(trimmed)
        if (idValue < 0n || idValue > STELLAR_MAX_MEMO_ID) {
          return {
            valid: false,
            byteLength,
            maxBytes: 20,
            error: 'Memo ID exceeds 64-bit unsigned integer maximum (18446744073709551615)',
          }
        }
        return {
          valid: true,
          byteLength,
          maxBytes: 20,
        }
      } catch {
        return {
          valid: false,
          byteLength,
          maxBytes: 20,
          error: 'Invalid Memo ID integer format',
        }
      }
    }

    case 'hash':
    case 'return': {
      // Must be a 32-byte hexadecimal string (64 characters)
      if (!HEX_32_BYTES_REGEX.test(trimmed)) {
        return {
          valid: false,
          byteLength,
          maxBytes: 64,
          error: `Memo ${type} must be a 32-byte hex string (64 hex characters)`,
        }
      }
      return {
        valid: true,
        byteLength,
        maxBytes: 64,
      }
    }

    case 'none': {
      if (trimmed.length > 0) {
        return {
          valid: false,
          byteLength,
          maxBytes: 0,
          error: 'Memo is not expected when memo type is none',
        }
      }
      return {
        valid: true,
        byteLength: 0,
        maxBytes: 0,
      }
    }

    default:
      return {
        valid: false,
        byteLength,
        maxBytes: STELLAR_MAX_MEMO_TEXT_BYTES,
        error: `Unsupported memo type: ${type}`,
      }
  }
}

/**
 * Validates Stellar payment parameters before constructing or sending a transaction.
 */
export function validateStellarPayment(
  params: StellarPaymentParams,
): StellarPaymentValidationResult {
  const errors: StellarPaymentValidationResult['errors'] = {}

  // Amount validation
  const minAmount = params.minAmount ?? 0.0000001
  if (!Number.isFinite(params.amount) || isNaN(params.amount)) {
    errors.amount = 'Please enter a valid amount'
  } else if (params.amount < minAmount) {
    errors.amount = `Amount must be at least ${minAmount}`
  } else if (params.balance !== undefined && params.amount > params.balance) {
    errors.amount = 'Amount exceeds your available balance'
  }

  // Destination address validation (optional if depositing into a known vault)
  if (params.destination !== undefined) {
    const addressValidation = validateStellarAddress(params.destination)
    if (!addressValidation.valid) {
      errors.destination = addressValidation.error ?? 'Invalid Stellar public address'
    }
  }

  // Memo validation
  if (params.memo !== undefined && params.memo !== '') {
    const memoValidation = validateMemo(params.memo, params.memoType ?? 'text')
    if (!memoValidation.valid) {
      errors.memo = memoValidation.error
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}
