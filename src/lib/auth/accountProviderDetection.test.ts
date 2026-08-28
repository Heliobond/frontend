import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  isValidEmail,
  detectEmailAuthProvider,
  getProviderDisplayName,
} from './accountProviderDetection'

describe('accountProviderDetection', () => {
  describe('normalizeEmail', () => {
    it('trims leading/trailing whitespace and converts to lowercase', () => {
      expect(normalizeEmail('  User@Domain.COM  ')).toBe('user@domain.com')
      expect(normalizeEmail('ALEX.DOE@GMAIL.COM')).toBe('alex.doe@gmail.com')
    })
  })

  describe('isValidEmail', () => {
    it('validates proper email formats', () => {
      expect(isValidEmail('test@example.com')).toBe(true)
      expect(isValidEmail('user.name+tag@sub.domain.org')).toBe(true)
    })

    it('rejects invalid email formats', () => {
      expect(isValidEmail('')).toBe(false)
      expect(isValidEmail('not-an-email')).toBe(false)
      expect(isValidEmail('missing@domain')).toBe(false)
      expect(isValidEmail('@nodomain.com')).toBe(false)
    })
  })

  describe('detectEmailAuthProvider', () => {
    const customRegistry = {
      'google.user@domain.com': 'google' as const,
      'apple.user@domain.com': 'apple' as const,
      'github.user@domain.com': 'github' as const,
      'regular.user@domain.com': 'email' as const,
    }

    it('detects google conflict when email is registered with Google OAuth', () => {
      const result = detectEmailAuthProvider('google.user@domain.com', customRegistry)
      expect(result.hasConflict).toBe(true)
      expect(result.existingProvider).toBe('google')
      expect(result.email).toBe('google.user@domain.com')
    })

    it('detects apple conflict case-insensitively', () => {
      const result = detectEmailAuthProvider('  APPLE.USER@DOMAIN.COM ', customRegistry)
      expect(result.hasConflict).toBe(true)
      expect(result.existingProvider).toBe('apple')
      expect(result.email).toBe('apple.user@domain.com')
    })

    it('reports no conflict for standard email-registered accounts or unlinked emails', () => {
      const emailResult = detectEmailAuthProvider('regular.user@domain.com', customRegistry)
      expect(emailResult.hasConflict).toBe(false)
      expect(emailResult.existingProvider).toBe('email')

      const unknownResult = detectEmailAuthProvider('brand.new@domain.com', customRegistry)
      expect(unknownResult.hasConflict).toBe(false)
      expect(unknownResult.existingProvider).toBeNull()
    })

    it('returns no conflict for malformed email strings', () => {
      const result = detectEmailAuthProvider('invalid-email-string')
      expect(result.hasConflict).toBe(false)
      expect(result.existingProvider).toBeNull()
    })
  })

  describe('getProviderDisplayName', () => {
    it('returns friendly provider names', () => {
      expect(getProviderDisplayName('google')).toBe('Google')
      expect(getProviderDisplayName('apple')).toBe('Apple')
      expect(getProviderDisplayName('github')).toBe('GitHub')
      expect(getProviderDisplayName('email')).toBe('Email')
      expect(getProviderDisplayName('wallet')).toBe('Stellar Wallet')
      expect(getProviderDisplayName(null)).toBe('Social Account')
    })
  })
})
