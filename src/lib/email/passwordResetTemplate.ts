/**
 * Heliobond — Password Reset Email Template Generator.
 *
 * Implements Issue #354: Explicit token expiration time (TTL) in password reset emails.
 * Generates production-ready, accessible, high-contrast HTML and plaintext email payloads
 * with strict XSS escaping, protocol sanitization, and localized relative/absolute expiration notices.
 */

export type SupportedLocale = 'en' | 'fr'

export interface PasswordResetEmailOptions {
  /** Target password reset link containing the verification token. */
  resetUrl: string
  /** Token Time-To-Live in minutes (e.g. 15, 30, 60, 1440). */
  expiresInMinutes: number
  /** Optional recipient display name or email. */
  recipientName?: string
  /** Timestamp when the reset token was generated. Defaults to Date.now(). */
  requestTimestamp?: number | Date
  /** Target language for the email copy. Defaults to 'en'. */
  locale?: SupportedLocale
  /** Support or contact URL for security queries. */
  supportUrl?: string
}

export interface GeneratedEmail {
  /** Email subject line. */
  subject: string
  /** Accessible plaintext version. */
  text: string
  /** Responsive, branded HTML version. */
  html: string
  /** Human-readable expiration notice. */
  expirationNotice: string
  /** Absolute calculated expiration Date instance. */
  expiresAt: Date
}

/**
 * HTML entity escaping to prevent markup injection in email clients.
 * Optimized for O(N) single-pass regex replacement.
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

/**
 * Validates and sanitizes a URL, allowing only safe HTTP/HTTPS protocols.
 * Prevents javascript: or data: URI injection attacks in email hrefs.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`)
    }
    return parsed.toString()
  } catch {
    // If URL parsing fails or protocol is unsafe, return a safe fragment fallback
    return '#'
  }
}

/**
 * Formats duration in minutes into localized natural language (e.g. "15 minutes", "1 hour", "24 hours").
 */
export function formatTtlDuration(minutes: number, locale: SupportedLocale = 'en'): string {
  const safeMinutes = Math.max(1, Math.round(minutes))

  if (safeMinutes < 60) {
    if (locale === 'fr') {
      return `${safeMinutes} minute${safeMinutes > 1 ? 's' : ''}`
    }
    return `${safeMinutes} minute${safeMinutes > 1 ? 's' : ''}`
  }

  const hours = Math.floor(safeMinutes / 60)
  const remainingMinutes = safeMinutes % 60

  if (remainingMinutes === 0) {
    if (locale === 'fr') {
      return `${hours} heure${hours > 1 ? 's' : ''}`
    }
    return `${hours} hour${hours > 1 ? 's' : ''}`
  }

  if (locale === 'fr') {
    return `${hours} h ${remainingMinutes} min`
  }
  return `${hours} hr ${remainingMinutes} min`
}

/**
 * Formats an ISO UTC timestamp for clear global deadline referencing (e.g. "14:30 UTC").
 */
export function formatUtcTime(date: Date): string {
  const hours = date.getUTCHours().toString().padStart(2, '0')
  const mins = date.getUTCMinutes().toString().padStart(2, '0')
  return `${hours}:${mins} UTC`
}

/**
 * Generates a complete password reset email payload with explicit expiration information.
 */
export function generatePasswordResetEmail(options: PasswordResetEmailOptions): GeneratedEmail {
  const {
    resetUrl,
    expiresInMinutes,
    recipientName,
    requestTimestamp = Date.now(),
    locale = 'en',
    supportUrl = 'https://heliobond.vercel.app/support',
  } = options

  const safeUrl = sanitizeUrl(resetUrl)
  const escapedSafeUrl = escapeHtml(safeUrl)
  const escapedRecipient = recipientName ? escapeHtml(recipientName) : null
  const escapedSupportUrl = escapeHtml(sanitizeUrl(supportUrl))

  const baseTime = typeof requestTimestamp === 'number' ? requestTimestamp : requestTimestamp.getTime()
  const expiresAt = new Date(baseTime + Math.max(1, expiresInMinutes) * 60 * 1000)
  const formattedTtl = formatTtlDuration(expiresInMinutes, locale)
  const formattedUtc = formatUtcTime(expiresAt)

  // Localized copy dictionaries
  const copy = {
    en: {
      subject: 'Reset your Heliobond password',
      greeting: escapedRecipient ? `Hello ${escapedRecipient},` : 'Hello,',
      lead: 'We received a request to reset your password for your Heliobond account.',
      cta: 'Reset your password',
      expiryAlertTitle: 'Token Expiration & Security Notice',
      expiryAlertBody: `This link is valid for <strong>${formattedTtl}</strong> (until <strong>${formattedUtc}</strong>). For security reasons, expired links cannot be reused.`,
      staleExplanation:
        'If this link has expired by the time you open it, please visit the sign-in page to request a new link.',
      altLinkInstruction:
        'If the button above does not work, copy and paste this URL into your web browser:',
      ignoreNotice:
        'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.',
      supportLabel: 'Need help?',
      supportCopy:
        'If you did not request this reset or need assistance, contact support:',
      footerBrand: 'Heliobond — Sunlight made financial.',
    },
    fr: {
      subject: 'Réinitialisez votre mot de passe Heliobond',
      greeting: escapedRecipient ? `Bonjour ${escapedRecipient},` : 'Bonjour,',
      lead: 'Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte Heliobond.',
      cta: 'Réinitialiser le mot de passe',
      expiryAlertTitle: 'Expiration du lien et sécurité',
      expiryAlertBody: `Ce lien est valide pendant <strong>${formattedTtl}</strong> (jusqu'à <strong>${formattedUtc}</strong>). Pour des raisons de sécurité, les liens expirés ne peuvent pas être réutilisés.`,
      staleExplanation:
        'Si ce lien a expiré au moment où vous l’ouvrez, veuillez vous rendre sur la page de connexion pour demander un nouveau lien.',
      altLinkInstruction:
        'Si le bouton ci-dessus ne fonctionne pas, copiez et collez cette URL dans votre navigateur :',
      ignoreNotice:
        'Si vous n’avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail en toute sécurité. Votre mot de passe restera inchangé.',
      supportLabel: 'Besoin d’aide ?',
      supportCopy:
        'Si vous n’avez pas demandé cette réinitialisation ou si vous avez besoin d’assistance, contactez le support :',
      footerBrand: 'Heliobond — L’énergie solaire devenue finance.',
    },
  }[locale]

  const expirationNotice =
    locale === 'fr'
      ? `Ce lien expire dans ${formattedTtl} (${formattedUtc}).`
      : `This link expires in ${formattedTtl} (${formattedUtc}).`

  // Plaintext version
  const text = `
${copy.greeting}

${copy.lead}

${copy.cta}:
${safeUrl}

============================================================
${copy.expiryAlertTitle.toUpperCase()}
============================================================
${expirationNotice}
${copy.staleExplanation}

${copy.ignoreNotice}

${copy.supportLabel}
${copy.supportCopy}
${sanitizeUrl(supportUrl)}

---
${copy.footerBrand}
`.trim()

  // High-contrast, brand-aligned HTML version (Heliobond design tokens: Pine #0B2B23, Canvas #F3F5F1, Solar #FFB400)
  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(copy.subject)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F3F5F1;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0B2B23;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #F3F5F1;
      padding: 40px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #FCFDFB;
      border: 1px solid #DCE3DB;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(11, 43, 35, 0.05);
    }
    .header {
      background-color: #0B2B23;
      padding: 24px 32px;
      text-align: left;
    }
    .header-logo {
      color: #FFB400;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-decoration: none;
    }
    .content {
      padding: 36px 32px 28px;
    }
    h1 {
      margin: 0 0 16px;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.3;
      color: #0B2B23;
      letter-spacing: -0.01em;
    }
    p {
      margin: 0 0 18px;
      font-size: 16px;
      line-height: 1.6;
      color: #2F4D45;
    }
    .btn-container {
      margin: 28px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      background-color: #0B2B23;
      color: #FCFDFB !important;
      padding: 14px 28px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 16px;
      text-decoration: none;
    }
    .alert-box {
      background-color: #FFF9EC;
      border-left: 4px solid #FFB400;
      border-radius: 8px;
      padding: 16px 18px;
      margin: 24px 0;
    }
    .alert-title {
      font-weight: 700;
      font-size: 14px;
      color: #614300;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .alert-text {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      color: #614300;
    }
    .url-fallback {
      background-color: #F3F5F1;
      border-radius: 8px;
      padding: 12px;
      font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 13px;
      word-break: break-all;
      color: #0B2B23;
      margin-top: 8px;
    }
    .footer {
      padding: 24px 32px;
      background-color: #F3F5F1;
      border-top: 1px solid #DCE3DB;
      font-size: 13px;
      color: #607971;
      line-height: 1.5;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <div class="container">
            <div class="header">
              <span class="header-logo">☀️ Heliobond</span>
            </div>
            <div class="content">
              <h1>${escapeHtml(copy.subject)}</h1>
              <p>${copy.greeting}</p>
              <p>${copy.lead}</p>
              
              <div class="btn-container">
                <a href="${escapedSafeUrl}" class="btn" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.cta)}</a>
              </div>

              <!-- Expiration and Security Notice Box -->
              <div class="alert-box" role="note" aria-label="${escapeHtml(copy.expiryAlertTitle)}">
                <div class="alert-title">⏳ ${escapeHtml(copy.expiryAlertTitle)}</div>
                <div class="alert-text">
                  ${copy.expiryAlertBody}
                  <br><br>
                  ${escapeHtml(copy.staleExplanation)}
                </div>
              </div>

              <p style="font-size: 14px; color: #607971; margin-bottom: 6px;">
                ${escapeHtml(copy.altLinkInstruction)}
              </p>
              <div class="url-fallback">${escapedSafeUrl}</div>

              <p style="font-size: 13px; color: #607971; margin-top: 24px; margin-bottom: 0;">
                ${escapeHtml(copy.ignoreNotice)}
              </p>
              <p style="font-size: 13px; color: #607971; margin-top: 12px; margin-bottom: 0;">
                <strong>${escapeHtml(copy.supportLabel)}</strong>
                ${escapeHtml(copy.supportCopy)}
                <br>
                <a href="${escapedSupportUrl}" style="color: #0B2B23; text-decoration: underline;">${escapedSupportUrl}</a>
              </p>
            </div>
            <div class="footer">
              ${escapeHtml(copy.footerBrand)}<br>
              <a href="${escapedSupportUrl}" style="color: #0B2B23; text-decoration: underline;">Support</a>
            </div>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`

  return {
    subject: copy.subject,
    text,
    html,
    expirationNotice,
    expiresAt,
  }
}
