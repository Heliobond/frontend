import { describe, it, expect } from 'vitest'
import { validateStellarMemo, MAX_STELLAR_MEMO_LENGTH } from './memo'

describe('Stellar memo validation', () => {
  it('defines maximum memo length as 28 bytes', () => {
    expect(MAX_STELLAR_MEMO_LENGTH).toBe(28)
  })

  it('passes when memo is undefined or empty', () => {
    expect(validateStellarMemo(undefined)).toEqual({ valid: true })
    expect(validateStellarMemo('')).toEqual({ valid: true })
  })

  it('passes when memo is within 28 bytes', () => {
    const validMemo = 'Green bond deposit'
    expect(validateStellarMemo(validMemo)).toEqual({ valid: true })
  })

  it('passes when memo is exactly 28 bytes', () => {
    const exact28CharMemo = '1234567890123456789012345678'
    expect(exact28CharMemo.length).toBe(28)
    expect(validateStellarMemo(exact28CharMemo)).toEqual({ valid: true })
  })

  it('fails when memo is 29 bytes', () => {
    const invalid29CharMemo = '12345678901234567890123456789'
    expect(invalid29CharMemo.length).toBe(29)
    const result = validateStellarMemo(invalid29CharMemo)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Memo text cannot exceed 28 bytes')
  })

  it('fails when memo is 100 characters (Issue #284 reproduction)', () => {
    const hundredCharMemo = 'a'.repeat(100)
    expect(hundredCharMemo.length).toBe(100)
    const result = validateStellarMemo(hundredCharMemo)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Memo text cannot exceed 28 bytes')
  })

  it('correctly measures multi-byte UTF-8 character length', () => {
    const multiByteMemo = '🌞'.repeat(10)
    const result = validateStellarMemo(multiByteMemo)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Memo text cannot exceed 28 bytes')
    expect(result.error).toContain('40 bytes provided')
  })
})
