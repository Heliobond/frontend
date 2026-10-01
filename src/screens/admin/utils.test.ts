import { describe, it, expect } from 'vitest'
import { clampScore, parseFundedNum, validateScores, isSafeScore, isValidScoreInput } from './utils'

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

describe('isSafeScore', () => {
  it('accepts 0–100 numerics including decimals', () => {
    expect(isSafeScore('0')).toBe(true)
    expect(isSafeScore('100')).toBe(true)
    expect(isSafeScore('72.5')).toBe(true)
  })

  it('rejects empties, non-numerics and out-of-range values', () => {
    expect(isSafeScore('')).toBe(false)
    expect(isSafeScore('abc')).toBe(false)
    expect(isSafeScore('150')).toBe(false)
    expect(isSafeScore('-1')).toBe(false)
  })
})

describe('isValidScoreInput', () => {
  it('accepts whole numbers from 0 to 100', () => {
    expect(isValidScoreInput('0')).toBe(true)
    expect(isValidScoreInput('82')).toBe(true)
    expect(isValidScoreInput('100')).toBe(true)
  })

  it('rejects empties, decimals and out-of-range values (#693)', () => {
    expect(isValidScoreInput('')).toBe(false)
    expect(isValidScoreInput('72.5')).toBe(false)
    expect(isValidScoreInput('150')).toBe(false)
    expect(isValidScoreInput('-1')).toBe(false)
    expect(isValidScoreInput('abc')).toBe(false)
  })
})
