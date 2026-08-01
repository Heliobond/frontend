/**
 * Referral Program — core logic for generating shareable referral links,
 * tracking referrals, and managing rewards on the Stellar network.
 *
 * ## Overview
 *
 * Every Heliobond user gets a unique referral code derived from their Stellar
 * wallet address. When a referred user signs up via the link and makes their
 * first deposit, both the referrer and referee receive a reward.
 *
 * ## Architecture
 *
 * - **Code generation**: Deterministic, based on wallet address hash (no DB needed)
 * - **Share links**: Pre-configured templates for Twitter, Telegram, email, clipboard
 * - **Reward tracking**: Reads on-chain events from the Heliobond vault contract
 * - **Demo mode**: When `NEXT_PUBLIC_VAULT_CONTRACT_ID` is absent, returns mock data
 *
 * ## Environment Variables
 *
 * | Variable | Default | Description |
 * |---|---|---|
 * | `NEXT_PUBLIC_REFERRAL_REWARD_USDC` | `5` | USDC reward per successful referral |
 * | `NEXT_PUBLIC_APP_URL` | `https://heliobond.vercel.app` | Base URL for share links |
 */

import { getHorizonUrl, getNetworkPassphrase } from './network'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReferralStats {
  /** Total number of users who signed up via this referral code */
  totalReferred: number
  /** Total USDC rewards earned from referrals */
  rewardsEarned: number
  /** Pending rewards (referrals not yet confirmed on-chain) */
  rewardsPending: number
  /** The user's unique referral code */
  referralCode: string
  /** Full shareable referral URL */
  referralLink: string
}

export interface ReferralRecord {
  /** Stellar address of the referred user */
  refereeAddress: string
  /** When the referral was created (ISO 8601) */
  createdAt: string
  /** Whether the referred user has completed their first deposit */
  completed: boolean
  /** USDC reward amount (0 if not yet completed) */
  rewardAmount: number
  /** On-chain transaction hash (empty if pending) */
  txHash: string
}

export type SharePlatform = 'twitter' | 'telegram' | 'email' | 'clipboard'

export interface ShareLink {
  platform: SharePlatform
  label: string
  url: string
  icon: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://heliobond.vercel.app'

const REWARD_USDC = Number(
  process.env.NEXT_PUBLIC_REFERRAL_REWARD_USDC ?? '5',
)

const REFERRAL_PATH = '/referral'

/** Characters used for referral code generation */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Length of the referral code */
const CODE_LENGTH = 8

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic referral code from a Stellar wallet address.
 * Uses a simple hash to produce an 8-character alphanumeric code.
 *
 * @param address - Stellar public key (G...)
 * @returns 8-character referral code
 */
export function generateReferralCode(address: string): string {
  if (!address || address.length < 10) {
    throw new Error('Invalid Stellar address')
  }

  // Simple deterministic hash from address bytes
  let hash = 0
  for (let i = 0; i < address.length; i++) {
    const char = address.charCodeAt(i)
    hash = (hash * 31 + char) & 0x7fffffff
  }

  // Generate code from hash
  let code = ''
  let remaining = Math.abs(hash)
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[remaining % CODE_CHARS.length]
    remaining = Math.floor(remaining / CODE_CHARS.length)
    if (remaining === 0) remaining = Math.abs(hash >> (i + 1))
  }

  return code
}

/**
 * Build the full referral URL for a given code.
 */
export function buildReferralLink(code: string): string {
  return `${APP_URL}${REFERRAL_PATH}?ref=${encodeURIComponent(code)}`
}

/**
 * Extract referral code from a URL or query string.
 *
 * @param input - URL string or raw query string containing ?ref=CODE
 * @returns The referral code, or null if not found
 */
export function extractReferralCode(input: string): string | null {
  try {
    const url = input.startsWith('http') ? new URL(input) : new URL(`https://x${input}`)
    return url.searchParams.get('ref')
  } catch {
    // Try simple regex fallback
    const match = input.match(/[?&]ref=([A-Z2-9]{8})/)
    return match ? match[1] : null
  }
}

/**
 * Validate that a referral code matches the expected format.
 */
export function isValidReferralCode(code: string): boolean {
  if (!code || code.length !== CODE_LENGTH) return false
  return [...code].every((c) => CODE_CHARS.includes(c))
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

const SHARE_TEXTS = {
  twitter: (link: string) =>
    `Join me on Heliobond 🌱 — invest in green bonds starting from $1.\n\nSign up with my referral link and we both earn $${REWARD_USDC} USDC:\n${link}`,
  telegram: (link: string) =>
    `🌱 Join Heliobond — green bond investing from $1!\n\nUse my referral link and we both earn $${REWARD_USDC} USDC:\n${link}`,
  email: (link: string) =>
    `Hi!\n\nI've been using Heliobond to invest in green bonds and thought you might like it too.\n\nSign up with my referral link and we both earn $${REWARD_USDC} USDC:\n${link}\n\n— Sent via Heliobond`,
}

/**
 * Generate share links for all supported platforms.
 *
 * @param referralCode - The user's referral code
 * @returns Array of ShareLink objects for each platform
 */
export function generateShareLinks(referralCode: string): ShareLink[] {
  const link = buildReferralLink(referralCode)

  return [
    {
      platform: 'twitter',
      label: 'Share on X',
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXTS.twitter(link))}`,
      icon: 'twitter',
    },
    {
      platform: 'telegram',
      label: 'Share on Telegram',
      url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(SHARE_TEXTS.telegram(link))}`,
      icon: 'telegram',
    },
    {
      platform: 'email',
      label: 'Share via Email',
      url: `mailto:?subject=${encodeURIComponent('Join Heliobond — Green Bond Investing')}&body=${encodeURIComponent(SHARE_TEXTS.email(link))}`,
      icon: 'email',
    },
    {
      platform: 'clipboard',
      label: 'Copy Link',
      url: link,
      icon: 'clipboard',
    },
  ]
}

// ---------------------------------------------------------------------------
// Reward calculation
// ---------------------------------------------------------------------------

/**
 * Get the configured reward amount in USDC.
 */
export function getReferralReward(): number {
  return REWARD_USDC
}

// ---------------------------------------------------------------------------
// Stats (mock / on-chain)
// ---------------------------------------------------------------------------

const isDemo = !process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID

/**
 * Fetch referral stats for a user.
 * In demo mode, returns mock data; otherwise queries the Stellar network.
 *
 * @param address - Stellar wallet address
 * @returns ReferralStats object
 */
export async function fetchReferralStats(address: string): Promise<ReferralStats> {
  const code = generateReferralCode(address)
  const link = buildReferralLink(code)

  if (isDemo) {
    return {
      totalReferred: 3,
      rewardsEarned: 15,
      rewardsPending: 5,
      referralCode: code,
      referralLink: link,
    }
  }

  // On-chain: query the vault contract for referral events
  try {
    const horizonUrl = getHorizonUrl()
    // Query Horizon for referral-related operations involving this address
    const response = await fetch(
      `${horizonUrl}/accounts/${address}/operations?limit=200&order=desc`,
    )
    if (!response.ok) {
      console.warn('Failed to fetch referral stats from Horizon')
      return {
        totalReferred: 0,
        rewardsEarned: 0,
        rewardsPending: 0,
        referralCode: code,
        referralLink: link,
      }
    }

    const data = await response.json()
    const records = data._embedded?.records ?? []

    // Count referral-related operations
    let totalReferred = 0
    let rewardsEarned = 0

    for (const record of records) {
      // Look for payment operations that match referral reward pattern
      if (record.type === 'payment' && record.asset_code === 'USDC') {
        const amount = Number(record.amount)
        if (amount === REWARD_USDC) {
          rewardsEarned += amount
        }
      }
      // Count create_account operations as referrals
      if (record.type === 'create_account' && record.source_account !== address) {
        totalReferred++
      }
    }

    return {
      totalReferred,
      rewardsEarned,
      rewardsPending: 0,
      referralCode: code,
      referralLink: link,
    }
  } catch (err) {
    console.error('Error fetching referral stats:', err)
    return {
      totalReferred: 0,
      rewardsEarned: 0,
      rewardsPending: 0,
      referralCode: code,
      referralLink: link,
    }
  }
}

/**
 * Fetch referral history for a user.
 *
 * @param address - Stellar wallet address
 * @returns Array of ReferralRecord objects
 */
export async function fetchReferralHistory(
  address: string,
): Promise<ReferralRecord[]> {
  if (isDemo) {
    return [
      {
        refereeAddress: 'GDEMO...REF1',
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        completed: true,
        rewardAmount: REWARD_USDC,
        txHash: 'demo_tx_001',
      },
      {
        refereeAddress: 'GDEMO...REF2',
        createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
        completed: true,
        rewardAmount: REWARD_USDC,
        txHash: 'demo_tx_002',
      },
      {
        refereeAddress: 'GDEMO...REF3',
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        completed: false,
        rewardAmount: 0,
        txHash: '',
      },
    ]
  }

  try {
    const horizonUrl = getHorizonUrl()
    const response = await fetch(
      `${horizonUrl}/accounts/${address}/payments?limit=50&order=desc`,
    )
    if (!response.ok) return []

    const data = await response.json()
    const records = data._embedded?.records ?? []

    return records
      .filter(
        (r: Record<string, unknown>) =>
          r.type === 'payment' &&
          (r as { asset_code?: string }).asset_code === 'USDC' &&
          Number((r as { amount?: string }).amount) === REWARD_USDC,
      )
      .map((r: Record<string, unknown>) => ({
        refereeAddress: (r as { from?: string }).from ?? 'unknown',
        createdAt: (r as { created_at?: string }).created_at ?? new Date().toISOString(),
        completed: true,
        rewardAmount: REWARD_USDC,
        txHash: (r as { transaction_hash?: string }).transaction_hash ?? '',
      }))
  } catch (err) {
    console.error('Error fetching referral history:', err)
    return []
  }
}
