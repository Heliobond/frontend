import { describe, expect, it } from 'vitest'

import {
  ERROR_CODE_MAP,
  FALLBACK_ERROR_CODE,
  getErrorCode,
  normalizeCode,
  parseErrorCode,
} from './errorMessages'

const FALLBACK = FALLBACK_ERROR_CODE
const NETWORK_CODE = ERROR_CODE_MAP.stellar_unreachable

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

describe('getErrorCode maps every ERROR_CODE_MAP entry', () => {
  const entries = Object.entries(ERROR_CODE_MAP)

  it('has a non-trivial map to cover', () => {
    expect(entries.length).toBeGreaterThan(10)
  })

  it.each(entries)('%s resolves to its own catalog key', (key, code) => {
    expect(getErrorCode(key)).toBe(code)
    if (code !== FALLBACK) {
      expect(getErrorCode(key)).not.toBe(FALLBACK)
    }
  })

  const variants = (key: string): string[] => [
    key.toUpperCase(),
    key.replace(/_/g, '-'),
    key.replace(/_/g, ' '),
    `  ${key}  `,
  ]

  it.each(entries)('%s resolves across case/separator/whitespace variants', (key, code) => {
    for (const variant of variants(key)) {
      expect(getErrorCode(variant), variant).toBe(code)
    }
  })

  it('still returns the fallback for an unknown code', () => {
    expect(getErrorCode('totally_unknown_code')).toBe(FALLBACK)
    expect(getErrorCode('')).toBe(FALLBACK)
  })
})

describe('parseErrorCode', () => {
  it('resolves an Axios-like 400 with a data.code', () => {
    expect(
      parseErrorCode({
        response: { status: 400, data: { code: 'insufficient_balance' } },
      }),
    ).toBe(ERROR_CODE_MAP.insufficient_balance)
  })

  it('resolves an Axios-like 5xx by status', () => {
    expect(parseErrorCode({ response: { status: 503 } })).toBe(ERROR_CODE_MAP['503'])
  })

  it('resolves a data.message payload', () => {
    expect(
      parseErrorCode({ response: { status: 400, data: { message: 'amount-too-low' } } }),
    ).toBe(ERROR_CODE_MAP.amount_too_low)
  })

  it('resolves a string response.data payload', () => {
    expect(parseErrorCode({ response: { status: 400, data: 'invalid_amount' } })).toBe(
      ERROR_CODE_MAP.invalid_amount,
    )
  })

  it('resolves an error object carrying a code', () => {
    expect(parseErrorCode({ code: 'wallet_not_connected' })).toBe(
      ERROR_CODE_MAP.wallet_not_connected,
    )
  })

  it('resolves an Error instance by its message', () => {
    expect(parseErrorCode(new Error('simulation_failed'))).toBe(ERROR_CODE_MAP.simulation_failed)
  })

  it('resolves a plain string', () => {
    expect(parseErrorCode('server_error')).toBe(ERROR_CODE_MAP.server_error)
  })

  it.each(['fetch failed', 'ECONNREFUSED', 'request failed'] as const)(
    'falls back to the network code for %s',
    (message) => {
      expect(parseErrorCode(new Error(message))).toBe(NETWORK_CODE)
      expect(parseErrorCode(new Error(message))).not.toBe(FALLBACK)
    },
  )

  it('resolves "Network Error" through the map entry before the network branch', () => {
    expect(parseErrorCode(new Error('Network Error'))).toBe(ERROR_CODE_MAP.network_error)
  })

  it('returns the fallback for nullish or opaque input', () => {
    expect(parseErrorCode(null)).toBe(FALLBACK)
    expect(parseErrorCode(undefined)).toBe(FALLBACK)
    expect(parseErrorCode(42)).toBe(FALLBACK)
  })
})
