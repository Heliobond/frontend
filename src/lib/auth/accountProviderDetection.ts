/**
 * Heliobond — Account Provider & Social Conflict Detection Utility.
 *
 * Implements Issue #353: Prevents duplicate or orphaned accounts when a user attempts
 * email authentication for an address previously registered with a social OAuth provider (e.g. Google, Apple).
 */

export type AuthProviderType = 'google' | 'apple' | 'github' | 'email' | 'wallet'

export interface AuthProviderDetectionResult {
  email: string
  hasConflict: boolean
  existingProvider: AuthProviderType | null
  messageKey?: string
}

// Known test/mock associations for demonstration and validation
const MOCK_SOCIAL_ACCOUNTS: Record<string, AuthProviderType> = {
  'alex.doe@gmail.com': 'google',
  'creator@google.com': 'google',
  'user@icloud.com': 'apple',
  'dev@github.com': 'github',
}

/**
 * Normalizes email by trimming whitespace and converting to lowercase.
 * O(N) complexity where N is string length.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Validates basic email formatting.
 */
export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(normalized)
}

/**
 * Detects whether an email is already associated with a social identity provider.
 * Returns conflict details if an existing social provider is registered for the email.
 */
export function detectEmailAuthProvider(
  rawEmail: string,
  customRegistry?: Record<string, AuthProviderType>,
): AuthProviderDetectionResult {
  const email = normalizeEmail(rawEmail)

  if (!isValidEmail(email)) {
    return {
      email,
      hasConflict: false,
      existingProvider: null,
    }
  }

  const registry = customRegistry ?? MOCK_SOCIAL_ACCOUNTS
  const existingProvider = registry[email] ?? null

  // A conflict exists if the email is registered via a social/OAuth provider
  const hasConflict =
    existingProvider !== null &&
    existingProvider !== 'email' &&
    existingProvider !== 'wallet'

  return {
    email,
    hasConflict,
    existingProvider,
  }
}

/**
 * Returns formatted human-readable provider name.
 */
export function getProviderDisplayName(provider: AuthProviderType | null): string {
  switch (provider) {
    case 'google':
      return 'Google'
    case 'apple':
      return 'Apple'
    case 'github':
      return 'GitHub'
    case 'email':
      return 'Email'
    case 'wallet':
      return 'Stellar Wallet'
    default:
      return 'Social Account'
  }
}
