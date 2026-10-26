import { describe, it, expect } from 'vitest'
import { clampScore, parseFundedNum, validateScores, isValidCreatorAddress } from './utils'

describe('admin utils', () => {
  describe('clampScore', () => {
    it('returns the number if it is between 0 and 100', () => {
      expect(clampScore('50')).toBe(50)
      expect(clampScore('100')).toBe(100)
    })

    it('handles edge case: 0', () => {
      expect(clampScore('0')).toBe(0)
    })

    it('handles edge case: negative numbers', () => {
      expect(clampScore('-1')).toBe(0)
      expect(clampScore('-50')).toBe(0)
      expect(clampScore('-1000')).toBe(0)
    })

    it('handles edge case: very large numbers', () => {
      expect(clampScore('101')).toBe(100)
      expect(clampScore('1000')).toBe(100)
      expect(clampScore('9999999999999')).toBe(100)
    })

    it('handles non-finite or invalid numbers', () => {
      expect(clampScore('abc')).toBe(0)
    })
  })

  describe('parseFundedNum', () => {
    it('parses typical funded amount strings', () => {
      expect(parseFundedNum('$1,180,000')).toBe(1180000)
      expect(parseFundedNum('1,234,567.89')).toBe(1234567.89)
    })

    it('handles edge case: 0', () => {
      expect(parseFundedNum('0')).toBe(0)
      expect(parseFundedNum('$0.00')).toBe(0)
    })

    it('handles edge case: negative numbers (strips negative sign)', () => {
      // Due to the regex /[^0-9.]/g, the '-' is stripped out
      expect(parseFundedNum('-100')).toBe(100)
      expect(parseFundedNum('-$5,000')).toBe(5000)
    })

    it('handles edge case: very large numbers', () => {
      expect(parseFundedNum('9,999,999,999,999')).toBe(9999999999999)
      expect(parseFundedNum('$1000000000000000')).toBe(1000000000000000)
    })

    it('handles empty or completely invalid strings', () => {
      expect(parseFundedNum('abc')).toBe(0)
      expect(parseFundedNum('')).toBe(0)
    })
  })

  describe('validateScores', () => {
    it('returns true for valid scores', () => {
      expect(validateScores('50', '50')).toBe(true)
      expect(validateScores('100', '100')).toBe(true)
    })

    it('handles edge case: 0', () => {
      expect(validateScores('0', '0')).toBe(true)
      expect(validateScores('0', '50')).toBe(true)
      expect(validateScores('50', '0')).toBe(true)
    })

    it('handles edge case: negative numbers', () => {
      expect(validateScores('-1', '50')).toBe(false)
      expect(validateScores('50', '-10')).toBe(false)
      expect(validateScores('-5', '-5')).toBe(false)
    })

    it('handles edge case: very large numbers', () => {
      expect(validateScores('101', '50')).toBe(false)
      expect(validateScores('50', '1000')).toBe(false)
      expect(validateScores('99999999', '99999999')).toBe(false)
    })

    it('returns false for empty strings', () => {
      expect(validateScores('', '50')).toBe(false)
      expect(validateScores('50', '')).toBe(false)
      expect(validateScores('', '')).toBe(false)
    })

    it('returns false for invalid numbers', () => {
      expect(validateScores('abc', '50')).toBe(false)
    })
  })
})

describe('isValidCreatorAddress (#691)', () => {
  it('accepts valid Stellar public keys', () => {
    expect(isValidCreatorAddress('GAQG5ETYGHGKH7SXCSMOPGIENAWWK2BG7VQBJA2ORDFNAE4GWYJLZQGM')).toBe(
      true,
    )
    expect(isValidCreatorAddress('GCKN3VALO5GPCDVJ37HFG2CSWEVZW2ZIB6CHZAWHRL6IDVJGWSI3JKVZ')).toBe(
      true,
    )
  })

  it('rejects invalid addresses', () => {
    expect(isValidCreatorAddress('GA7QY...solar')).toBe(false)
    expect(isValidCreatorAddress('GBVIG...tidal')).toBe(false)
    expect(isValidCreatorAddress('')).toBe(false)
    expect(isValidCreatorAddress('not-an-address')).toBe(false)
    expect(isValidCreatorAddress('GA7QY')).toBe(false)
    expect(isValidCreatorAddress('CA7QY...solar')).toBe(false)
  })

  it('trims whitespace before validation', () => {
    expect(
      isValidCreatorAddress('  GAQG5ETYGHGKH7SXCSMOPGIENAWWK2BG7VQBJA2ORDFNAE4GWYJLZQGM  '),
    ).toBe(true)
  })
})
