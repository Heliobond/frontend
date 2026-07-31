import { describe, it, expect } from 'vitest'
import { vault, SHARE_PRICE, submitDeposit, submitWithdraw } from './vault'

describe('Vault math functions', () => {
  describe('convertToShares', () => {
    it('converts USDC to shares using fixed share price', () => {
      const usdc = 100
      const shares = vault.convertToShares(usdc)
      expect(shares).toBe(usdc / SHARE_PRICE)
    })

    it('handles zero input', () => {
      const shares = vault.convertToShares(0)
      expect(shares).toBe(0)
    })

    it('handles fractional USDC amounts', () => {
      const usdc = 0.5
      const shares = vault.convertToShares(usdc)
      expect(shares).toBe(usdc / SHARE_PRICE)
      expect(shares).toBeGreaterThan(0)
    })

    it('handles large amounts', () => {
      const usdc = 1_000_000
      const shares = vault.convertToShares(usdc)
      expect(shares).toBe(usdc / SHARE_PRICE)
      expect(shares).toBeLessThan(usdc)
    })

    it('returns expected result for common amounts', () => {
      // If SHARE_PRICE is 1.0, then 100 USDC = 100 shares
      const result = vault.convertToShares(100)
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThan(0)
    })
  })

  describe('convertToAssets', () => {
    it('converts shares back to USDC using fixed share price', () => {
      const shares = 100
      const assets = vault.convertToAssets(shares)
      expect(assets).toBe(shares * SHARE_PRICE)
    })

    it('handles zero input', () => {
      const assets = vault.convertToAssets(0)
      expect(assets).toBe(0)
    })

    it('handles fractional shares', () => {
      const shares = 0.25
      const assets = vault.convertToAssets(shares)
      expect(assets).toBe(shares * SHARE_PRICE)
      expect(assets).toBeGreaterThan(0)
    })

    it('handles large amounts', () => {
      const shares = 1_000_000
      const assets = vault.convertToAssets(shares)
      expect(assets).toBe(shares * SHARE_PRICE)
      expect(assets).toBeGreaterThan(shares)
    })

    it('roundtrips correctly with convertToShares', () => {
      const originalUsdc = 123.45
      const shares = vault.convertToShares(originalUsdc)
      const backToUsdc = vault.convertToAssets(shares)
      expect(backToUsdc).toBeCloseTo(originalUsdc)
    })
  })

  describe('previewDeposit', () => {
    it('returns correct structure for deposit preview', () => {
      const preview = vault.previewDeposit(100)
      expect(preview).toHaveProperty('shares')
      expect(preview).toHaveProperty('sharePrice')
      expect(preview).toHaveProperty('networkFee')
    })

    it('calculates shares correctly for deposit', () => {
      const usdc = 100
      const preview = vault.previewDeposit(usdc)
      expect(preview.shares).toBe(usdc / SHARE_PRICE)
    })

    it('includes correct share price', () => {
      const preview = vault.previewDeposit(100)
      expect(preview.sharePrice).toBe(SHARE_PRICE)
    })

    it('includes network fee', () => {
      const preview = vault.previewDeposit(100)
      expect(preview.networkFee).toBe(0.00001)
      expect(typeof preview.networkFee).toBe('number')
    })

    it('handles zero deposit', () => {
      const preview = vault.previewDeposit(0)
      expect(preview.shares).toBe(0)
      expect(preview.sharePrice).toBe(SHARE_PRICE)
      expect(preview.networkFee).toBe(0.00001)
    })

    it('handles fractional deposits', () => {
      const preview = vault.previewDeposit(0.001)
      expect(preview.shares).toBe(0.001 / SHARE_PRICE)
      expect(preview.shares).toBeGreaterThan(0)
    })

    it('handles large deposits', () => {
      const usdc = 999_999.99
      const preview = vault.previewDeposit(usdc)
      expect(preview.shares).toBe(usdc / SHARE_PRICE)
      expect(preview.networkFee).toBe(0.00001)
    })
  })

  describe('previewWithdraw', () => {
    it('returns correct structure for withdraw preview', () => {
      const preview = vault.previewWithdraw(100)
      expect(preview).toHaveProperty('assets')
      expect(preview).toHaveProperty('sharePrice')
      expect(preview).toHaveProperty('networkFee')
    })

    it('returns exact USDC amount requested', () => {
      const usdc = 100
      const preview = vault.previewWithdraw(usdc)
      expect(preview.assets).toBe(usdc)
    })

    it('includes correct share price', () => {
      const preview = vault.previewWithdraw(100)
      expect(preview.sharePrice).toBe(SHARE_PRICE)
    })

    it('includes network fee', () => {
      const preview = vault.previewWithdraw(100)
      expect(preview.networkFee).toBe(0.00001)
      expect(typeof preview.networkFee).toBe('number')
    })

    it('handles zero withdrawal', () => {
      const preview = vault.previewWithdraw(0)
      expect(preview.assets).toBe(0)
      expect(preview.sharePrice).toBe(SHARE_PRICE)
      expect(preview.networkFee).toBe(0.00001)
    })

    it('handles fractional withdrawals', () => {
      const preview = vault.previewWithdraw(0.001)
      expect(preview.assets).toBe(0.001)
      expect(preview.sharePrice).toBe(SHARE_PRICE)
    })

    it('handles large withdrawals', () => {
      const usdc = 999_999.99
      const preview = vault.previewWithdraw(usdc)
      expect(preview.assets).toBe(usdc)
      expect(preview.networkFee).toBe(0.00001)
    })
  })

  describe('Share price consistency', () => {
    it('share price is constant across operations', () => {
      const preview1 = vault.previewDeposit(100)
      const preview2 = vault.previewWithdraw(200)
      const directPrice = vault.sharePrice()

      expect(preview1.sharePrice).toBe(directPrice)
      expect(preview2.sharePrice).toBe(directPrice)
      expect(preview1.sharePrice).toBe(preview2.sharePrice)
    })

    it('conversion functions use the same share price', () => {
      const usdc = 100
      const shares = vault.convertToShares(usdc)
      const backToUsdc = vault.convertToAssets(shares)

      expect(backToUsdc).toBeCloseTo(usdc)
    })
  })

  describe('submitDeposit and submitWithdraw memo validation', () => {
    const dummyAddress = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYSFTXF4VGWVJ5SZ3BG'
    const dummySign = async (xdr: string) => xdr

    it('rejects deposit with memo exceeding 28 bytes', async () => {
      const invalidMemo = 'a'.repeat(100)
      await expect(
        submitDeposit(100, dummyAddress, dummySign, undefined, invalidMemo),
      ).rejects.toThrow('Memo text cannot exceed 28 bytes')
    })

    it('rejects withdraw with memo exceeding 28 bytes', async () => {
      const invalidMemo = 'a'.repeat(100)
      await expect(
        submitWithdraw(100, dummyAddress, dummySign, undefined, invalidMemo),
      ).rejects.toThrow('Memo text cannot exceed 28 bytes')
    })

    it('allows deposit with valid memo <= 28 characters in demo mode', async () => {
      const validMemo = 'Green bond deposit'
      const hash = await submitDeposit(100, dummyAddress, dummySign, undefined, validMemo)
      expect(hash).toMatch(/^demo/)
    })

    it('allows withdraw with valid memo <= 28 characters in demo mode', async () => {
      const validMemo = 'Withdraw shares'
      const hash = await submitWithdraw(100, dummyAddress, dummySign, undefined, validMemo)
      expect(hash).toMatch(/^demo/)
    })
  })
})
