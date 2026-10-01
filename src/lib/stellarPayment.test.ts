import { describe, it, expect } from 'vitest'
import {
  getMemoByteLength,
  validateMemoLength,
  validateMemo,
  validateStellarPayment,
  validateStellarAddress,
  isValidStellarAddress,
  validatePublicKey,
  isValidPublicKey,
  STELLAR_MAX_MEMO_TEXT_BYTES,
  STELLAR_MAX_MEMO_ID,
} from './stellarPayment'

describe('Stellar memo validation', () => {
  describe('getMemoByteLength', () => {
    it('returns 0 for empty, null, or undefined', () => {
      expect(getMemoByteLength('')).toBe(0)
      expect(getMemoByteLength(null)).toBe(0)
      expect(getMemoByteLength(undefined)).toBe(0)
    })

    it('returns correct byte count for ASCII strings', () => {
      expect(getMemoByteLength('hello')).toBe(5)
      expect(getMemoByteLength('a'.repeat(28))).toBe(28)
      expect(getMemoByteLength('a'.repeat(100))).toBe(100)
    })

    it('returns correct byte count for multibyte UTF-8 characters', () => {
      // 'é' is 2 bytes in UTF-8
      expect(getMemoByteLength('é')).toBe(2)
      // '€' is 3 bytes in UTF-8
      expect(getMemoByteLength('€')).toBe(3)
      // '🚀' is 4 bytes in UTF-8
      expect(getMemoByteLength('🚀')).toBe(4)
      // 8 emojis = 32 bytes (exceeds 28 bytes even though character count is 8)
      expect(getMemoByteLength('🚀🚀🚀🚀🚀🚀🚀🚀')).toBe(32)
    })
  })

  describe('validateMemoLength', () => {
    it('accepts memos <= 28 bytes', () => {
      expect(validateMemoLength('').valid).toBe(true)
      expect(validateMemoLength('inv-12345').valid).toBe(true)
      expect(validateMemoLength('a'.repeat(28)).valid).toBe(true)
    })

    it('rejects memos > 28 bytes', () => {
      const result29 = validateMemoLength('a'.repeat(29))
      expect(result29.valid).toBe(false)
      expect(result29.error).toContain('maximum is 28 bytes')
    })

    it('rejects a 100-character memo with descriptive error', () => {
      const longMemo = 'a'.repeat(100)
      const result = validateMemoLength(longMemo)
      expect(result.valid).toBe(false)
      expect(result.byteLength).toBe(100)
      expect(result.maxBytes).toBe(STELLAR_MAX_MEMO_TEXT_BYTES)
      expect(result.error).toBe('Memo is too long: 100 bytes (maximum is 28 bytes)')
    })

    it('rejects multibyte strings that exceed 28 bytes despite having fewer than 28 characters', () => {
      // 8 emojis = 8 characters but 32 bytes
      const emojis = '🚀🚀🚀🚀🚀🚀🚀🚀'
      expect(emojis.length).toBe(16) // UTF-16 surrogate pairs
      const result = validateMemoLength(emojis)
      expect(result.valid).toBe(false)
      expect(result.byteLength).toBe(32)
      expect(result.error).toContain('32 bytes')
    })
  })

  describe('validateMemo (text memo type)', () => {
    it('validates text memo by default', () => {
      expect(validateMemo('deposit #42').valid).toBe(true)
      expect(validateMemo(null).valid).toBe(true)
      expect(validateMemo(undefined).valid).toBe(true)
      expect(validateMemo('   ').valid).toBe(true)
    })

    it('rejects text memo longer than 28 bytes', () => {
      const longMemo = 'x'.repeat(100)
      const result = validateMemo(longMemo, 'text')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Memo text is too long')
      expect(result.error).toContain('100 bytes')
    })

    it('trims whitespace before checking length', () => {
      const memoWithSpaces = '  hello world  '
      const result = validateMemo(memoWithSpaces, 'text')
      expect(result.valid).toBe(true)
      expect(result.byteLength).toBe(11)
    })
  })

  describe('validateMemo (id memo type)', () => {
    it('accepts valid 64-bit unsigned integers', () => {
      expect(validateMemo('0', 'id').valid).toBe(true)
      expect(validateMemo('123456789', 'id').valid).toBe(true)
      expect(validateMemo(STELLAR_MAX_MEMO_ID.toString(), 'id').valid).toBe(true)
    })

    it('rejects non-numeric memo IDs', () => {
      const result = validateMemo('abc', 'id')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Memo ID must be a non-negative integer')
    })

    it('rejects negative numbers', () => {
      const result = validateMemo('-123', 'id')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Memo ID must be a non-negative integer')
    })

    it('rejects values exceeding uint64 maximum', () => {
      const overflow = (STELLAR_MAX_MEMO_ID + 1n).toString()
      const result = validateMemo(overflow, 'id')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('exceeds 64-bit unsigned integer maximum')
    })
  })

  describe('validateMemo (hash and return memo types)', () => {
    const validHex = 'a'.repeat(64)

    it('accepts valid 64-character hex strings for hash', () => {
      expect(validateMemo(validHex, 'hash').valid).toBe(true)
      expect(validateMemo(validHex, 'return').valid).toBe(true)
    })

    it('rejects invalid length hex strings', () => {
      const result = validateMemo('a'.repeat(63), 'hash')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be a 32-byte hex string (64 hex characters)')
    })

    it('rejects non-hex characters', () => {
      const nonHex = 'z'.repeat(64)
      const result = validateMemo(nonHex, 'hash')
      expect(result.valid).toBe(false)
    })
  })

  describe('validateMemo (none memo type)', () => {
    it('accepts empty string or undefined', () => {
      expect(validateMemo('', 'none').valid).toBe(true)
      expect(validateMemo(undefined, 'none').valid).toBe(true)
    })

    it('rejects any non-empty memo when type is none', () => {
      const result = validateMemo('something', 'none')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Memo is not expected when memo type is none')
    })
  })

  describe('validateStellarPayment', () => {
    const validAddress = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'

    it('validates a correct payment without memo', () => {
      const result = validateStellarPayment({
        amount: 50,
        destination: validAddress,
        balance: 100,
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual({})
    })

    it('validates a correct payment with valid memo', () => {
      const result = validateStellarPayment({
        amount: 50,
        destination: validAddress,
        memo: 'project backing #12',
        memoType: 'text',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual({})
    })

    it('rejects payment when memo exceeds 28 bytes (e.g. 100 characters)', () => {
      const result = validateStellarPayment({
        amount: 50,
        destination: validAddress,
        memo: 'x'.repeat(100),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.memo).toContain('100 bytes')
    })

    it('rejects payment with invalid amount', () => {
      const result = validateStellarPayment({
        amount: -5,
        destination: validAddress,
      })
      expect(result.valid).toBe(false)
      expect(result.errors.amount).toBeDefined()
    })

    it('rejects payment exceeding balance', () => {
      const result = validateStellarPayment({
        amount: 150,
        balance: 100,
        destination: validAddress,
      })
      expect(result.valid).toBe(false)
      expect(result.errors.amount).toBe('Amount exceeds your available balance')
    })

    it('rejects payment with invalid destination address format', () => {
      const result = validateStellarPayment({
        amount: 50,
        destination: 'invalid-stellar-address',
      })
      expect(result.valid).toBe(false)
      expect(result.errors.destination).toContain('Invalid Stellar public address')
    })

    it('rejects payment destination address with typos (56 chars starting with G)', () => {
      // 56-char base32 string starting with G, but invalid checksum due to typo
      const typoAddress = validAddress.slice(0, -1) + 'A'
      expect(typoAddress.length).toBe(56)
      expect(typoAddress.startsWith('G')).toBe(true)

      const result = validateStellarPayment({
        amount: 50,
        destination: typoAddress,
      })
      expect(result.valid).toBe(false)
      expect(result.errors.destination).toContain('Invalid Stellar public address checksum')
    })
  })

  describe('Stellar public key / address validation', () => {
    const validAddress1 = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
    const validAddress2 = 'GCMRTJ2F7U4THN6VWWNA5GO6WLPPBY6NI5SFBQKLPKTZHY7KPVX6M7MT'

    it('accepts valid Stellar public addresses', () => {
      expect(validateStellarAddress(validAddress1).valid).toBe(true)
      expect(isValidStellarAddress(validAddress1)).toBe(true)
      expect(isValidPublicKey(validAddress1)).toBe(true)
      expect(validatePublicKey(validAddress1).valid).toBe(true)

      expect(validateStellarAddress(validAddress2).valid).toBe(true)
      expect(isValidStellarAddress(validAddress2)).toBe(true)
    })

    it('accepts address with surrounding whitespace by trimming', () => {
      const padded = `   ${validAddress1}   `
      expect(validateStellarAddress(padded).valid).toBe(true)
      expect(isValidStellarAddress(padded)).toBe(true)
    })

    it('catches typos in 56-character addresses that start with G', () => {
      // Modifying the last character
      const typoLastChar = validAddress1.slice(0, -1) + 'A'
      expect(typoLastChar.length).toBe(56)
      expect(typoLastChar.startsWith('G')).toBe(true)

      const resLast = validateStellarAddress(typoLastChar)
      expect(resLast.valid).toBe(false)
      expect(resLast.error).toContain('Invalid Stellar public address checksum')
      expect(isValidStellarAddress(typoLastChar)).toBe(false)

      // Modifying a middle character
      const typoMidChar =
        validAddress1.slice(0, 20) +
        (validAddress1[20] === 'A' ? 'B' : 'A') +
        validAddress1.slice(21)
      expect(typoMidChar.length).toBe(56)
      expect(typoMidChar.startsWith('G')).toBe(true)

      const resMid = validateStellarAddress(typoMidChar)
      expect(resMid.valid).toBe(false)
      expect(resMid.error).toContain('Invalid Stellar public address checksum')
      expect(isValidStellarAddress(typoMidChar)).toBe(false)
    })

    it('rejects addresses with invalid length', () => {
      expect(validateStellarAddress('G123').valid).toBe(false)
      expect(validateStellarAddress(validAddress1 + 'A').valid).toBe(false)
      expect(isValidStellarAddress('G123')).toBe(false)
    })

    it('rejects addresses that do not start with G', () => {
      // Secret seed starting with S
      const secretSeed = 'SBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
      expect(validateStellarAddress(secretSeed).valid).toBe(false)
      expect(isValidStellarAddress(secretSeed)).toBe(false)

      // Contract address starting with C
      const contract = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE'
      expect(validateStellarAddress(contract).valid).toBe(false)
      expect(isValidStellarAddress(contract)).toBe(false)
    })

    it('rejects addresses with invalid base32 characters', () => {
      // '0', '1', '8', '9' are not in RFC 4648 base32
      const invalidChars = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX01'
      expect(validateStellarAddress(invalidChars).valid).toBe(false)
      expect(isValidStellarAddress(invalidChars)).toBe(false)
    })

    it('rejects empty, null, or undefined values with clear error', () => {
      expect(validateStellarAddress('').valid).toBe(false)
      expect(validateStellarAddress('   ').valid).toBe(false)
      expect(validateStellarAddress(null).valid).toBe(false)
      expect(validateStellarAddress(undefined).valid).toBe(false)
      expect(isValidStellarAddress(null)).toBe(false)
      expect(isValidStellarAddress('')).toBe(false)
    })
  })
})
