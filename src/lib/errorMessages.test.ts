import { describe, it, expect } from 'vitest'
import { getErrorCode, parseErrorCode } from './errorMessages'
import { AppError } from './appError'

describe('errorMessages mapping', () => {
  it('maps memo_too_long code to memoTooLong', () => {
    expect(getErrorCode('memo_too_long')).toBe('memoTooLong')
    expect(getErrorCode('err_memo_too_long')).toBe('memoTooLong')
    expect(getErrorCode('memo_length_exceeded')).toBe('memoTooLong')
  })

  it('maps invalid_memo code to invalidMemo', () => {
    expect(getErrorCode('invalid_memo')).toBe('invalidMemo')
  })

  it('maps tx_malformed code to txMalformed', () => {
    expect(getErrorCode('tx_malformed')).toBe('txMalformed')
  })

  it('detects cryptic backend error messages mentioning memo length and maps them to a code', () => {
    expect(getErrorCode('Error: Memo text is too long (expected max 28 bytes, got 100)')).toBe(
      'memoTooLong',
    )
    expect(getErrorCode('Backend rejected: transaction memo length exceeds limit')).toBe(
      'memoTooLong',
    )
    expect(getErrorCode('Horizon op_malformed: memo byte length > 28')).toBe('memoTooLong')
  })

  it('parses error object with memo code', () => {
    const error = { code: 'memo_too_long' }
    expect(parseErrorCode(error)).toBe('memoTooLong')
  })

  it('parses Error instance with memo length message', () => {
    const error = new Error('Memo text is too long: 100 bytes (maximum is 28 bytes)')
    expect(parseErrorCode(error)).toBe('memoTooLong')
  })

  it('passes AppError codes through unchanged', () => {
    expect(parseErrorCode(new AppError('memoTooLong'))).toBe('memoTooLong')
    expect(parseErrorCode(new AppError('usernameRequired'))).toBe('usernameRequired')
    expect(parseErrorCode(new AppError('simulationFailed'))).toBe('simulationFailed')
  })

  it('maps invalid_address and address_checksum_failed codes', () => {
    expect(getErrorCode('invalid_address')).toBe('invalidAddress')
    expect(getErrorCode('address_checksum_failed')).toBe('addressChecksumFailed')
    expect(getErrorCode('invalid_destination')).toBe('invalidAddress')
  })

  it('detects cryptic backend error messages mentioning address checksum and maps them to a code', () => {
    expect(getErrorCode('Invalid Stellar public address checksum (please check for typos)')).toBe(
      'invalidAddress',
    )
    expect(getErrorCode('Error: Stellar address checksum verification failed')).toBe('invalidAddress')
  })
})
