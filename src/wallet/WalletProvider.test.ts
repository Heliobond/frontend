import { describe, it, expect } from 'vitest'
import { shortAddress } from './WalletProvider'

describe('shortAddress', () => {
  const longAddress = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
  const shortStr = 'ABC'

  describe('Long addresses', () => {
    it('truncates long addresses with ellipsis in the middle', () => {
      const result = shortAddress(longAddress)
      expect(result).toContain('…')
      expect(result).not.toBe(longAddress)
    })

    it('preserves lead characters', () => {
      const result = shortAddress(longAddress, 4)
      expect(result.slice(0, 4)).toBe('GBQH')
    })

    it('preserves tail characters', () => {
      const result = shortAddress(longAddress, 4, 3)
      expect(result.slice(-3)).toBe('H59')
    })

    it('uses default lead=4 and tail=3 when not specified', () => {
      const result = shortAddress(longAddress)
      expect(result.slice(0, 4)).toBe('GBQH')
      expect(result.slice(-3)).toBe('H59')
    })

    it('custom lead and tail parameters work correctly', () => {
      const result = shortAddress(longAddress, 6, 5)
      expect(result.slice(0, 6)).toBe('GBQHWX')
      expect(result.slice(-5)).toBe('X4Z6B')
      expect(result).toContain('…')
    })
  })

  describe('Short addresses', () => {
    it('returns short strings unchanged when length <= lead + tail + 1', () => {
      const result = shortAddress(shortStr, 4, 3)
      expect(result).toBe('ABC')
      expect(result).not.toContain('…')
    })

    it('returns exactly threshold-length strings unchanged', () => {
      // threshold = lead + tail + 1 = 4 + 3 + 1 = 8
      const eightChar = 'ABCDEFGH'
      const result = shortAddress(eightChar, 4, 3)
      expect(result).toBe('ABCDEFGH')
      expect(result).not.toContain('…')
    })

    it('truncates strings just over the threshold', () => {
      // threshold = 4 + 3 + 1 = 8, so 9 chars should truncate
      const nineChar = 'ABCDEFGHI'
      const result = shortAddress(nineChar, 4, 3)
      expect(result).toContain('…')
      expect(result).toBe('ABCD…GHI')
    })
  })

  describe('Edge cases', () => {
    it('handles empty string', () => {
      const result = shortAddress('', 4, 3)
      expect(result).toBe('')
    })

    it('handles single character', () => {
      const result = shortAddress('A', 4, 3)
      expect(result).toBe('A')
    })

    it('handles zero lead and tail', () => {
      const result = shortAddress(longAddress, 0, 0)
      expect(result).toBe('…')
    })

    it('handles only lead, no tail', () => {
      const result = shortAddress(longAddress, 10, 0)
      expect(result.startsWith('GBQHWXVZ2K')).toBe(true)
      expect(result).toContain('…')
    })

    it('handles only tail, no lead', () => {
      const result = shortAddress(longAddress, 0, 10)
      expect(result.endsWith('O7S9U2X4Z6')).toBe(true)
      expect(result).toContain('…')
    })
  })

  describe('Stellar address format', () => {
    it('truncates full Stellar addresses (56 characters)', () => {
      const stellarAddress = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
      expect(stellarAddress.length).toBe(56)
      const result = shortAddress(stellarAddress)
      expect(result).toContain('…')
      expect(result.length).toBeLessThan(stellarAddress.length)
    })

    it('preserves readability with default parameters for Stellar addresses', () => {
      const stellarAddress = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'
      const result = shortAddress(stellarAddress)
      expect(result).toMatch(/^G.{3}….{2}Q$/)
    })
  })
})
