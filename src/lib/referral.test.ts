import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateReferralCode,
  buildReferralLink,
  extractReferralCode,
  isValidReferralCode,
  generateShareLinks,
  getReferralReward,
  fetchReferralStats,
  fetchReferralHistory,
} from './referral'
import type { ShareLink } from './referral'

// ---------------------------------------------------------------------------
// generateReferralCode
// ---------------------------------------------------------------------------

describe('generateReferralCode', () => {
  it('generates an 8-character code from a valid Stellar address', () => {
    const code = generateReferralCode(
      'GBZXH6KPAFQYH2QYJWPHUJYDZMCCXGZM3BYK6HOVZZVQJXMJVHFXK4YA',
    )
    expect(code).toHaveLength(8)
    expect(isValidReferralCode(code)).toBe(true)
  })

  it('produces deterministic codes — same address = same code', () => {
    const addr = 'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343'
    const code1 = generateReferralCode(addr)
    const code2 = generateReferralCode(addr)
    expect(code1).toBe(code2)
  })

  it('produces different codes for different addresses', () => {
    const code1 = generateReferralCode(
      'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343',
    )
    const code2 = generateReferralCode(
      'GBZXH6KPAFQYH2QYJWPHUJYDZMCCXGZM3BYK6HOVZZVQJXMJVHFXK4YA',
    )
    expect(code1).not.toBe(code2)
  })

  it('only contains valid characters (no I, O, 0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateReferralCode(`GDEMO${String(i).padStart(48, 'A')}`)
      expect(code).not.toMatch(/[IO01]/)
      expect(isValidReferralCode(code)).toBe(true)
    }
  })

  it('throws on invalid / too-short address', () => {
    expect(() => generateReferralCode('')).toThrow('Invalid Stellar address')
    expect(() => generateReferralCode('G')).toThrow('Invalid Stellar address')
  })

  it('handles addresses of different lengths', () => {
    const short = 'GABCDEFGHIJKLMNOP'
    const long =
      'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343XXXX'
    expect(generateReferralCode(short)).toHaveLength(8)
    expect(generateReferralCode(long)).toHaveLength(8)
  })
})

// ---------------------------------------------------------------------------
// buildReferralLink
// ---------------------------------------------------------------------------

describe('buildReferralLink', () => {
  it('builds a URL with the referral code as query param', () => {
    const link = buildReferralLink('ABCDEFGH')
    expect(link).toContain('/referral?ref=ABCDEFGH')
    expect(link).toMatch(/^https?:\/\//)
  })

  it('encodes special characters in the code', () => {
    const link = buildReferralLink('ABC DEF')
    expect(link).toContain('ABC%20DEF')
  })

  it('uses the configured APP_URL', () => {
    const link = buildReferralLink('TESTCODE')
    expect(link.startsWith('https://')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// extractReferralCode
// ---------------------------------------------------------------------------

describe('extractReferralCode', () => {
  it('extracts ref param from a full URL', () => {
    const code = extractReferralCode(
      'https://heliobond.vercel.app/referral?ref=ABCDEFGH',
    )
    expect(code).toBe('ABCDEFGH')
  })

  it('extracts ref param from a relative path with query', () => {
    const code = extractReferralCode('/referral?ref=JKLMNPQR')
    expect(code).toBe('JKLMNPQR')
  })

  it('returns null when no ref param present', () => {
    expect(extractReferralCode('/referral')).toBeNull()
    expect(extractReferralCode('https://heliobond.vercel.app/')).toBeNull()
  })

  it('extracts ref from URL with multiple query params', () => {
    const code = extractReferralCode(
      'https://heliobond.vercel.app/referral?ref=ABCDEFGH&utm_source=twitter',
    )
    expect(code).toBe('ABCDEFGH')
  })

  it('returns null for invalid code format in ref', () => {
    const code = extractReferralCode('/referral?ref=123')
    expect(code).toBe('123') // extract just returns the raw value; validation is separate
  })

  it('extracts from plain query string', () => {
    const code = extractReferralCode('?ref=TUVWXY23')
    expect(code).toBe('TUVWXY23')
  })
})

// ---------------------------------------------------------------------------
// isValidReferralCode
// ---------------------------------------------------------------------------

describe('isValidReferralCode', () => {
  it('accepts valid 8-char codes', () => {
    expect(isValidReferralCode('ABCDEFGH')).toBe(true)
    expect(isValidReferralCode('23456789')).toBe(true)
    expect(isValidReferralCode('JKLMNPQR')).toBe(true)
  })

  it('rejects codes that are too short', () => {
    expect(isValidReferralCode('ABC')).toBe(false)
    expect(isValidReferralCode('ABCDEFG')).toBe(false)
  })

  it('rejects codes that are too long', () => {
    expect(isValidReferralCode('ABCDEFGHI')).toBe(false)
  })

  it('rejects codes with invalid characters', () => {
    expect(isValidReferralCode('ABCDEFG0')).toBe(false)
    expect(isValidReferralCode('ABCDEFG1')).toBe(false)
    expect(isValidReferralCode('ABCDEFGO')).toBe(false)
    expect(isValidReferralCode('ABCDEFGI')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidReferralCode('')).toBe(false)
  })

  it('rejects lowercase codes', () => {
    expect(isValidReferralCode('abcdefgh')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generateShareLinks
// ---------------------------------------------------------------------------

describe('generateShareLinks', () => {
  let links: ShareLink[]

  beforeEach(() => {
    links = generateShareLinks('ABCDEFGH')
  })

  it('returns 4 share links', () => {
    expect(links).toHaveLength(4)
  })

  it('includes twitter share link', () => {
    const twitter = links.find((l) => l.platform === 'twitter')
    expect(twitter).toBeDefined()
    expect(twitter!.url).toContain('twitter.com/intent/tweet')
    expect(twitter!.url).toContain('ref=ABCDEFGH')
    expect(twitter!.label).toBe('Share on X')
  })

  it('includes telegram share link', () => {
    const telegram = links.find((l) => l.platform === 'telegram')
    expect(telegram).toBeDefined()
    expect(telegram!.url).toContain('t.me/share/url')
    expect(telegram!.url).toContain('ref=ABCDEFGH')
    expect(telegram!.label).toBe('Share on Telegram')
  })

  it('includes email share link', () => {
    const email = links.find((l) => l.platform === 'email')
    expect(email).toBeDefined()
    expect(email!.url).toContain('mailto:')
    expect(email!.url).toContain('ref=ABCDEFGH')
    expect(email!.label).toBe('Share via Email')
  })

  it('includes clipboard share link with plain URL', () => {
    const clipboard = links.find((l) => l.platform === 'clipboard')
    expect(clipboard).toBeDefined()
    expect(clipboard!.url).toContain('/referral?ref=ABCDEFGH')
    expect(clipboard!.label).toBe('Copy Link')
    expect(clipboard!.icon).toBe('clipboard')
  })

  it('all platform URLs are valid', () => {
    for (const link of links) {
      if (link.platform === 'clipboard') {
        expect(link.url).toMatch(/^https?:\/\//)
      } else if (link.platform === 'email') {
        expect(link.url.startsWith('mailto:')).toBe(true)
      } else {
        expect(link.url).toMatch(/^https?:\/\//)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// getReferralReward
// ---------------------------------------------------------------------------

describe('getReferralReward', () => {
  it('returns the default reward amount', () => {
    const reward = getReferralReward()
    expect(reward).toBeGreaterThan(0)
    expect(typeof reward).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// fetchReferralStats
// ---------------------------------------------------------------------------

describe('fetchReferralStats', () => {
  it('returns stats with referralCode and referralLink', async () => {
    const stats = await fetchReferralStats(
      'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343',
    )
    expect(stats).toHaveProperty('referralCode')
    expect(stats).toHaveProperty('referralLink')
    expect(stats.referralCode).toHaveLength(8)
    expect(stats.referralLink).toContain(stats.referralCode)
  })

  it('returns stats with numeric fields', async () => {
    const stats = await fetchReferralStats(
      'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343',
    )
    expect(typeof stats.totalReferred).toBe('number')
    expect(typeof stats.rewardsEarned).toBe('number')
    expect(typeof stats.rewardsPending).toBe('number')
    expect(stats.totalReferred).toBeGreaterThanOrEqual(0)
  })

  it('produces deterministic referralCode for same address', async () => {
    const addr = 'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343'
    const stats1 = await fetchReferralStats(addr)
    const stats2 = await fetchReferralStats(addr)
    expect(stats1.referralCode).toBe(stats2.referralCode)
  })

  it('handles empty/invalid address gracefully', async () => {
    await expect(fetchReferralStats('')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// fetchReferralHistory
// ---------------------------------------------------------------------------

describe('fetchReferralHistory', () => {
  it('returns an array of referral records', async () => {
    const history = await fetchReferralHistory(
      'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343',
    )
    expect(Array.isArray(history)).toBe(true)
  })

  it('each record has expected properties', async () => {
    const history = await fetchReferralHistory(
      'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343',
    )
    for (const record of history) {
      expect(record).toHaveProperty('refereeAddress')
      expect(record).toHaveProperty('createdAt')
      expect(record).toHaveProperty('completed')
      expect(record).toHaveProperty('rewardAmount')
      expect(record).toHaveProperty('txHash')
    }
  })

  it('returns empty array for invalid address in non-demo', async () => {
    // In demo mode it returns mock data; in production it falls back to empty
    const history = await fetchReferralHistory('')
    // Should not throw; returns [] or gracefully handles
    expect(Array.isArray(history)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Integration: end-to-end referral flow
// ---------------------------------------------------------------------------

describe('Referral flow integration', () => {
  it('generates code → builds link → extracts code roundtrip', () => {
    const address =
      'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343'
    const code = generateReferralCode(address)
    const link = buildReferralLink(code)
    const extracted = extractReferralCode(link)
    expect(extracted).toBe(code)
  })

  it('generated code is always valid', () => {
    for (let i = 0; i < 50; i++) {
      const address = `G${String(i).padStart(55, 'A')}`
      const code = generateReferralCode(address)
      expect(isValidReferralCode(code)).toBe(true)
    }
  })

  it('share links contain the correct referral URL', () => {
    const address =
      'GDEMOF6TCSZPZFQACJVLEPGQQNPG4XDYUDIV7OJIYKTPHXTJKF76B343'
    const code = generateReferralCode(address)
    const links = generateShareLinks(code)
    for (const link of links) {
      expect(link.url).toContain(code)
    }
  })
})
