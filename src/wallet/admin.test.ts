import { describe, it, expect, vi } from 'vitest'
import { isValidCreatorAddress, submitSetWhitelist } from './admin'

describe('Creator Whitelist Validation & Actions (Issue #691)', () => {
  const VALID_G_ADDR = 'GCVIMAOPBRGVPOO7BSEO5OAAQ7S3CFPZSBZVCJALT4R6Q2WB473X5RQL'

  describe('isValidCreatorAddress', () => {
    it('accepts valid Stellar Ed25519 public keys (G...)', () => {
      expect(isValidCreatorAddress(VALID_G_ADDR)).toBe(true)
    })

    it('rejects invalid or placeholder addresses', () => {
      expect(isValidCreatorAddress('')).toBe(false)
      expect(isValidCreatorAddress('invalid-address')).toBe(false)
      expect(isValidCreatorAddress('creator_1')).toBe(false)
      expect(isValidCreatorAddress('0x1234567890abcdef')).toBe(false)
      expect(isValidCreatorAddress('GCVIMAOPBRGVPOO7BSEO5OAAQ7S3CFPZSBZVCJALT4R6Q2WB473X5RQ')).toBe(
        false,
      ) // short
      expect(isValidCreatorAddress(VALID_G_ADDR.toLowerCase())).toBe(false) // lowercase
    })
  })

  describe('submitSetWhitelist validation gate', () => {
    it('throws error and rejects invalid address before building transaction', async () => {
      const mockSign = vi.fn()
      await expect(
        submitSetWhitelist('invalid-address', true, VALID_G_ADDR, mockSign),
      ).rejects.toThrow('Invalid Stellar creator address: invalid-address')
      expect(mockSign).not.toHaveBeenCalled()
    })

    it('executes simulation fallback successfully for valid address when contract ID is not configured', async () => {
      const mockSign = vi.fn()
      const result = await submitSetWhitelist(VALID_G_ADDR, true, VALID_G_ADDR, mockSign)
      expect(result).toHaveProperty('hash')
      expect(typeof result.hash).toBe('string')
    })
  })
})
