import { describe, it, expect } from 'vitest'
import { getFriendlyErrorMessage, parseAndFriendlyError } from './errorMessages'

describe('errorMessages mapping', () => {
  it('maps memo_too_long code to user-friendly message', () => {
    expect(getFriendlyErrorMessage('memo_too_long')).toBe(
      'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
    )
    expect(getFriendlyErrorMessage('err_memo_too_long')).toBe(
      'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
    )
    expect(getFriendlyErrorMessage('memo_length_exceeded')).toBe(
      'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
    )
  })

  it('maps invalid_memo code to friendly message', () => {
    expect(getFriendlyErrorMessage('invalid_memo')).toBe(
      'Invalid memo — text memos must be 28 bytes or fewer.',
    )
  })

  it('maps tx_malformed code to friendly message', () => {
    expect(getFriendlyErrorMessage('tx_malformed')).toBe(
      'Transaction malformed — please check your transaction inputs and memo.',
    )
  })

  it('detects cryptic backend error messages mentioning memo length and translates them', () => {
    expect(
      getFriendlyErrorMessage('Error: Memo text is too long (expected max 28 bytes, got 100)'),
    ).toBe('Memo is too long — Stellar text memos must be 28 bytes or fewer.')
    expect(getFriendlyErrorMessage('Backend rejected: transaction memo length exceeds limit')).toBe(
      'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
    )
    expect(getFriendlyErrorMessage('Horizon op_malformed: memo byte length > 28')).toBe(
      'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
    )
  })

  it('parses error object with memo code', () => {
    const error = { code: 'memo_too_long' }
    expect(parseAndFriendlyError(error)).toBe(
      'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
    )
  })

  it('parses Error instance with memo length message', () => {
    const error = new Error('Memo text is too long: 100 bytes (maximum is 28 bytes)')
    expect(parseAndFriendlyError(error)).toBe(
      'Memo is too long — Stellar text memos must be 28 bytes or fewer.',
    )
  })

  it('maps invalid_address and address_checksum_failed codes to user-friendly message', () => {
    expect(getFriendlyErrorMessage('invalid_address')).toBe(
      'Invalid Stellar address — please check the address for typos.',
    )
    expect(getFriendlyErrorMessage('address_checksum_failed')).toBe(
      'Invalid Stellar address checksum — please check for typos.',
    )
    expect(getFriendlyErrorMessage('invalid_destination')).toBe(
      'Invalid destination address — please check the address for typos.',
    )
  })

  it('detects cryptic backend error messages mentioning address checksum and translates them', () => {
    expect(
      getFriendlyErrorMessage('Invalid Stellar public address checksum (please check for typos)'),
    ).toBe('Invalid Stellar address — please check the address for typos.')
    expect(getFriendlyErrorMessage('Error: Stellar address checksum verification failed')).toBe(
      'Invalid Stellar address — please check the address for typos.',
    )
  })
})
