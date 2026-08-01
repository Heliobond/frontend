/**
 * ReferralShareLink — displays the user's referral link with copy-to-clipboard
 * and social sharing buttons.
 *
 * Usage:
 *   <ReferralShareLink referralCode="ABCDEFGH" />
 */

'use client'

import { useState, useCallback } from 'react'
import { generateShareLinks } from '@/lib/referral'
import type { ShareLink } from '@/lib/referral'
import { Button } from './Button'
import { IconButton } from './IconButton'

export interface ReferralShareLinkProps {
  /** The user's unique referral code */
  referralCode: string
  /** Optional class name for the wrapper */
  className?: string
}

/** Social platform icon mapping — simple SVG paths */
const ICONS: Record<string, string> = {
  twitter: '🐦',
  telegram: '📨',
  email: '✉️',
  clipboard: '📋',
}

export function ReferralShareLink({ referralCode, className }: ReferralShareLinkProps) {
  const [copied, setCopied] = useState(false)
  const shareLinks = generateShareLinks(referralCode)

  const handleCopy = useCallback(async () => {
    const clipboardLink = shareLinks.find((l) => l.platform === 'clipboard')
    if (!clipboardLink) return

    try {
      await navigator.clipboard.writeText(clipboardLink.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = clipboardLink.url
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [shareLinks])

  const handleShare = useCallback((link: ShareLink) => {
    if (link.platform === 'clipboard') {
      handleCopy()
      return
    }
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }, [handleCopy])

  const clipboardLink = shareLinks.find((l) => l.platform === 'clipboard')
  const socialLinks = shareLinks.filter((l) => l.platform !== 'clipboard')

  return (
    <div className={`referral-share-link ${className ?? ''}`}>
      {/* Referral link display + copy button */}
      <div className="referral-share-link__input-group">
        <input
          type="text"
          readOnly
          value={clipboardLink?.url ?? ''}
          className="referral-share-link__input"
          aria-label="Your referral link"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <Button
          size="sm"
          onClick={handleCopy}
          aria-label={copied ? 'Copied!' : 'Copy referral link'}
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </Button>
      </div>

      {/* Social sharing buttons */}
      <div className="referral-share-link__socials">
        <span className="referral-share-link__socials-label">Share via:</span>
        <div className="referral-share-link__socials-buttons">
          {socialLinks.map((link) => (
            <IconButton
              key={link.platform}
              label={link.label}
              onClick={() => handleShare(link)}
              aria-label={link.label}
            >
              {ICONS[link.platform] ?? '🔗'}
            </IconButton>
          ))}
        </div>
      </div>
    </div>
  )
}
