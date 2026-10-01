import { describe, it, expect, vi } from 'vitest'
import {
  validateMetadataUri,
  validateMaturityDate,
  buildCanonicalMetadata,
  computeSha256,
  encodeCreateProjectArgs,
  submitCreateProject,
  NotWhitelistedError,
} from './registry'

describe('ProjectRegistry create_project integration (#697)', () => {
  describe('URI Validation (Contract parity)', () => {
    it('rejects empty or non-string URIs', () => {
      expect(validateMetadataUri('').valid).toBe(false)
      expect(validateMetadataUri(null as unknown as string).valid).toBe(false)
    })

    it('rejects URIs shorter than 8 characters', () => {
      const res = validateMetadataUri('ipfs://')
      expect(res.valid).toBe(false)
      expect(res.error).toContain('at least 8 characters')
    })

    it('rejects URIs longer than 512 characters', () => {
      const longUri = 'https://example.com/' + 'a'.repeat(500)
      const res = validateMetadataUri(longUri)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('cannot exceed 512 characters')
    })

    it('rejects invalid schemes (http, ftp, etc.)', () => {
      expect(validateMetadataUri('http://example.com/meta.json').valid).toBe(false)
      expect(validateMetadataUri('ftp://files.example.com/meta.json').valid).toBe(false)
      expect(validateMetadataUri('data:text/json;base64,...').valid).toBe(false)
    })

    it('accepts valid ipfs://, https://, and ar:// URIs within length bounds', () => {
      expect(validateMetadataUri('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi').valid).toBe(true)
      expect(validateMetadataUri('https://heliobond.io/metadata/project-1.json').valid).toBe(true)
      expect(validateMetadataUri('ar://b1234567890abcdefghijklmnopqrstuvwxyz').valid).toBe(true)
    })
  })

  describe('Maturity Date Validation', () => {
    it('accepts 0 for open-ended projects', () => {
      expect(validateMaturityDate(0).valid).toBe(true)
    })

    it('rejects past timestamps', () => {
      const now = 1750000000
      const past = now - 100
      const res = validateMaturityDate(past, now)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('must be in the future')
    })

    it('rejects negative or non-finite numbers', () => {
      expect(validateMaturityDate(-10).valid).toBe(false)
      expect(validateMaturityDate(NaN).valid).toBe(false)
    })

    it('accepts future timestamps', () => {
      const now = 1750000000
      const future = now + 86400 * 365
      expect(validateMaturityDate(future, now).valid).toBe(true)
    })
  })

  describe('Canonical Metadata & SHA-256 Hash Computation', () => {
    it('builds deterministic canonical JSON from project fields', () => {
      const payload = {
        name: 'Solar Farm Alpha',
        location: 'Nevada, USA',
        type: 'Solar' as const,
        story: 'Clean energy generation',
        fundingGoal: 500000,
      }
      const jsonStr = buildCanonicalMetadata(payload)
      const parsed = JSON.parse(jsonStr)
      expect(parsed.name).toBe('Solar Farm Alpha')
      expect(parsed.fundingGoal).toBe(500000)
    })

    it('computes 64-character lowercase hex SHA-256 hash', async () => {
      const content = 'hello world'
      const hash = await computeSha256(content)
      // SHA-256 of "hello world" is b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    })
  })

  describe('Argument Encoding for create_project', () => {
    it('encodes Address, String, u64, and BytesN<32> ScVals correctly', async () => {
      const creator = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
      const uri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
      const maturity = 1800000000
      const hashHex = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'

      const args = await encodeCreateProjectArgs(creator, uri, maturity, hashHex)
      expect(args).toHaveLength(4)

      const { scValToNative } = await import('@stellar/stellar-sdk')
      expect(scValToNative(args[0])).toBe(creator)
      expect(scValToNative(args[1])).toBe(uri)
      expect(scValToNative(args[2])).toBe(BigInt(maturity))
      
      const hashVal = scValToNative(args[3])
      expect(Buffer.from(hashVal).toString('hex')).toBe(hashHex)
    })

    it('throws when metadata hash is not 64 hex characters (32 bytes)', async () => {
      const creator = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
      const uri = 'ipfs://valid-uri-here-12345'
      await expect(encodeCreateProjectArgs(creator, uri, 0, 'invalid-short-hash')).rejects.toThrow(
        /Invalid metadata hash/,
      )
    })
  })

  describe('submitCreateProject Demo and Error Handling', () => {
    it('executes successfully in demo mode when contract ID is unset', async () => {
      const creator = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
      const uri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
      const hashHex = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      const mockSign = vi.fn().mockResolvedValue('mock-signed-xdr')

      const res = await submitCreateProject(creator, uri, 0, hashHex, mockSign)
      expect(res.projectId).toBeGreaterThan(0)
      expect(res.hash).toContain('demo_create_')
    })

    it('validates URI before submission', async () => {
      const creator = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
      const mockSign = vi.fn()
      await expect(
        submitCreateProject(creator, 'short', 0, 'a'.repeat(64), mockSign),
      ).rejects.toThrow(/at least 8 characters/)
    })

    it('instantiates NotWhitelistedError with appropriate message', () => {
      const err = new NotWhitelistedError()
      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe('NotWhitelistedError')
      expect(err.message).toContain('not whitelisted')
    })
  })
})
