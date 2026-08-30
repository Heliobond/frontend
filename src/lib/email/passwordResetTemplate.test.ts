import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  sanitizeUrl,
  formatTtlDuration,
  formatUtcTime,
  generatePasswordResetEmail,
} from './passwordResetTemplate'

describe('passwordResetTemplate', () => {
  describe('escapeHtml', () => {
    it('escapes &, <, >, ", and single quotes', () => {
      const input = '<script>alert("XSS & \'attack\'")</script>'
      const output = escapeHtml(input)
      expect(output).toBe(
        '&lt;script&gt;alert(&quot;XSS &amp; &#39;attack&#39;&quot;)&lt;/script&gt;',
      )
    })

    it('returns untouched string if no special characters are present', () => {
      expect(escapeHtml('Heliobond Solar')).toBe('Heliobond Solar')
    })
  })

  describe('sanitizeUrl', () => {
    it('allows valid HTTPS URLs', () => {
      const url = 'https://heliobond.vercel.app/reset-password?token=abc123xyz'
      expect(sanitizeUrl(url)).toBe(url)
    })

    it('allows valid HTTP URLs (e.g. localhost testing)', () => {
      const url = 'http://localhost:3000/reset?token=test'
      expect(sanitizeUrl(url)).toBe(url)
    })

    it('rejects javascript: schemes and returns safe fallback #', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('#')
    })

    it('rejects data: schemes and invalid URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#')
      expect(sanitizeUrl('not-a-valid-url')).toBe('#')
    })
  })

  describe('formatTtlDuration', () => {
    it('formats single minute correctly in English and French', () => {
      expect(formatTtlDuration(1, 'en')).toBe('1 minute')
      expect(formatTtlDuration(1, 'fr')).toBe('1 minute')
    })

    it('formats multiple minutes correctly', () => {
      expect(formatTtlDuration(15, 'en')).toBe('15 minutes')
      expect(formatTtlDuration(15, 'fr')).toBe('15 minutes')
    })

    it('formats single hour correctly', () => {
      expect(formatTtlDuration(60, 'en')).toBe('1 hour')
      expect(formatTtlDuration(60, 'fr')).toBe('1 heure')
    })

    it('formats multiple hours correctly', () => {
      expect(formatTtlDuration(120, 'en')).toBe('2 hours')
      expect(formatTtlDuration(120, 'fr')).toBe('2 heures')
    })

    it('formats hours and remaining minutes', () => {
      expect(formatTtlDuration(90, 'en')).toBe('1 hr 30 min')
      expect(formatTtlDuration(90, 'fr')).toBe('1 h 30 min')
    })

    it('handles fractional / zero / negative values gracefully by enforcing minimum of 1 min', () => {
      expect(formatTtlDuration(0, 'en')).toBe('1 minute')
      expect(formatTtlDuration(-5, 'en')).toBe('1 minute')
      expect(formatTtlDuration(14.8, 'en')).toBe('15 minutes')
    })
  })

  describe('formatUtcTime', () => {
    it('formats UTC hours and minutes with leading zeroes', () => {
      const fixedDate = new Date(Date.UTC(2026, 7, 28, 9, 5, 0))
      expect(formatUtcTime(fixedDate)).toBe('09:05 UTC')

      const afternoonDate = new Date(Date.UTC(2026, 7, 28, 14, 45, 0))
      expect(formatUtcTime(afternoonDate)).toBe('14:45 UTC')
    })
  })

  describe('generatePasswordResetEmail', () => {
    const fixedNow = new Date(Date.UTC(2026, 7, 28, 14, 0, 0)).getTime()
    const sampleUrl = 'https://heliobond.vercel.app/reset-password?token=secret123'

    it('generates a complete English email with explicit 15-minute TTL and UTC deadline', () => {
      const email = generatePasswordResetEmail({
        resetUrl: sampleUrl,
        expiresInMinutes: 15,
        recipientName: 'Alex Doe',
        requestTimestamp: fixedNow,
        locale: 'en',
        supportUrl: 'https://heliobond.vercel.app/support',
      })

      expect(email.subject).toBe('Reset your Heliobond password')
      expect(email.expiresAt).toEqual(new Date(fixedNow + 15 * 60 * 1000))
      expect(email.expirationNotice).toBe('This link expires in 15 minutes (14:15 UTC).')

      // Plaintext checks
      expect(email.text).toContain('Hello Alex Doe,')
      expect(email.text).toContain('This link expires in 15 minutes (14:15 UTC).')
      expect(email.text).toContain('TOKEN EXPIRATION & SECURITY NOTICE')
      expect(email.text).toContain(
        'If this link has expired by the time you open it, please visit the sign-in page to request a new link.',
      )
      expect(email.text).toContain('Need help?')
      expect(email.text).toContain('https://heliobond.vercel.app/support')
      expect(email.text).toContain(sampleUrl)

      // HTML checks
      expect(email.html).toContain('<!DOCTYPE html>')
      expect(email.html).toContain('Hello Alex Doe,')
      expect(email.html).toContain('15 minutes')
      expect(email.html).toContain('14:15 UTC')
      expect(email.html).toContain('Token Expiration &amp; Security Notice')
      expect(email.html).toContain(sampleUrl)
      expect(email.html).toContain('Reset your password')
    })

    it('generates a complete French email with translated expiration notice', () => {
      const email = generatePasswordResetEmail({
        resetUrl: sampleUrl,
        expiresInMinutes: 60,
        recipientName: 'Claire',
        requestTimestamp: fixedNow,
        locale: 'fr',
        supportUrl: 'https://heliobond.vercel.app/support',
      })

      expect(email.subject).toBe('Réinitialisez votre mot de passe Heliobond')
      expect(email.expirationNotice).toBe('Ce lien expire dans 1 heure (15:00 UTC).')
      expect(email.text).toContain('Bonjour Claire,')
      expect(email.text).toContain('Ce lien expire dans 1 heure (15:00 UTC).')
      expect(email.text).toContain('EXPIRATION DU LIEN ET SÉCURITÉ')
      expect(email.text).toContain(
        'Si ce lien a expiré au moment où vous l’ouvrez, veuillez vous rendre sur la page de connexion pour demander un nouveau lien.',
      )
      expect(email.text).toContain('Besoin d’aide ?')
      expect(email.text).toContain('https://heliobond.vercel.app/support')
      expect(email.html).toContain('Réinitialiser le mot de passe')
      expect(email.html).toContain('1 heure')
      expect(email.html).toContain('15:00 UTC')
    })

    it('escapes malicious recipient names to prevent HTML injection', () => {
      const email = generatePasswordResetEmail({
        resetUrl: sampleUrl,
        expiresInMinutes: 30,
        recipientName: '<img src=x onerror=alert(1)>',
        requestTimestamp: fixedNow,
      })

      expect(email.html).not.toContain('<img src=x onerror=alert(1)>')
      expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })

    it('sanitizes unsafe reset URLs in email CTA links', () => {
      const email = generatePasswordResetEmail({
        resetUrl: 'javascript:alert("pwned")',
        expiresInMinutes: 15,
        requestTimestamp: fixedNow,
      })

      expect(email.html).not.toContain('href="javascript:')
      expect(email.html).toContain('href="#"')
    })
  })
})
