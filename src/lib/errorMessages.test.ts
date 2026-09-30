import { describe, expect, it } from 'vitest'

import en from '../../messages/en.json'
import {
  ERROR_CODE_MAP,
  getFriendlyErrorMessage,
  normalizeCode,
  parseAndFriendlyError,
} from './errorMessages'

const FALLBACK = 'Something went wrong - please try again.'
const NETWORK_MESSAGE = ERROR_CODE_MAP.stellar_unreachable

describe('normalizeCode', () => {
  it('preserves the letter "s" (#718 regression)', () => {
    expect(normalizeCode('insufficient_balance')).toBe('insufficient_balance')
  })

  it('collapses whitespace and hyphens to a single underscore', () => {
    expect(normalizeCode('  Amount-Exceeds   Balance  ')).toBe('amount_exceeds_balance')
  })

  it('lower-cases the result', () => {
    expect(normalizeCode('SERVER_ERROR')).toBe('server_error')
  })
})

describe('getFriendlyErrorMessage maps every ERROR_CODE_MAP entry', () => {
  const entries = Object.entries(ERROR_CODE_MAP)

  it('has a non-trivial map to cover', () => {
    expect(entries.length).toBeGreaterThan(10)
  })

  it.each(entries)('%s resolves to its own message', (key, message) => {
    expect(getFriendlyErrorMessage(key)).toBe(message)
    if (message !== FALLBACK) {
      expect(getFriendlyErrorMessage(key)).not.toBe(FALLBACK)
    }
  })

  const variants = (key: string): string[] => [
    key.toUpperCase(),
    key.replace(/_/g, '-'),
    key.replace(/_/g, ' '),
    `  ${key}  `,
  ]

  it.each(entries)('%s resolves across case/separator/whitespace variants', (key, message) => {
    for (const variant of variants(key)) {
      expect(getFriendlyErrorMessage(variant), variant).toBe(message)
    }
  })

  it('still returns the fallback for an unknown code', () => {
    expect(getFriendlyErrorMessage('totally_unknown_code')).toBe(FALLBACK)
    expect(getFriendlyErrorMessage('')).toBe(FALLBACK)
  })
})

describe('parseAndFriendlyError', () => {
  it('resolves an Axios-like 400 with a data.code', () => {
    expect(
      parseAndFriendlyError({
        response: { status: 400, data: { code: 'insufficient_balance' } },
      }),
    ).toBe(ERROR_CODE_MAP.insufficient_balance)
  })

  it('resolves an Axios-like 5xx by status', () => {
    expect(parseAndFriendlyError({ response: { status: 503 } })).toBe(ERROR_CODE_MAP['503'])
  })

  it('resolves a data.message payload', () => {
    expect(
      parseAndFriendlyError({ response: { status: 400, data: { message: 'amount-too-low' } } }),
    ).toBe(ERROR_CODE_MAP.amount_too_low)
  })

  it('resolves a string response.data payload', () => {
    expect(parseAndFriendlyError({ response: { status: 400, data: 'invalid_amount' } })).toBe(
      ERROR_CODE_MAP.invalid_amount,
    )
  })

  it('resolves an error object carrying a code', () => {
    expect(parseAndFriendlyError({ code: 'wallet_not_connected' })).toBe(
      ERROR_CODE_MAP.wallet_not_connected,
    )
  })

  it('resolves an Error instance by its message', () => {
    expect(parseAndFriendlyError(new Error('simulation_failed'))).toBe(
      ERROR_CODE_MAP.simulation_failed,
    )
  })

  it('resolves a plain string', () => {
    expect(parseAndFriendlyError('server_error')).toBe(ERROR_CODE_MAP.server_error)
  })

  it('delegates Error(Contract, #N) messages to the contract translator', () => {
    expect(parseAndFriendlyError(new Error('Error(Contract, #33)'))).toBe(
      en.ContractErrors.vault_SlippageLimitExceeded,
    )
  })

  it.each(['fetch failed', 'ECONNREFUSED', 'request failed'] as const)(
    'falls back to the network message for %s',
    (message) => {
      expect(parseAndFriendlyError(new Error(message))).toBe(NETWORK_MESSAGE)
      expect(parseAndFriendlyError(new Error(message))).not.toBe(FALLBACK)
    },
  )

  it('resolves "Network Error" through the map entry before the network branch', () => {
    expect(parseAndFriendlyError(new Error('Network Error'))).toBe(ERROR_CODE_MAP.network_error)
  })

  it('returns the fallback for nullish or opaque input', () => {
    expect(parseAndFriendlyError(null)).toBe(FALLBACK)
    expect(parseAndFriendlyError(undefined)).toBe(FALLBACK)
    expect(parseAndFriendlyError(42)).toBe(FALLBACK)
  })
})
