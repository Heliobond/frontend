import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validateMetadataUri,
  validateMaturityDate,
  buildCanonicalMetadata,
  computeSha256,
  encodeCreateProjectArgs,
  submitCreateProject,
  NotWhitelistedError,
} from './registry'

const rpcMock = vi.hoisted(() => ({
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
  loadAccount: vi.fn(),
}))

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()
  class Server {
    simulateTransaction = rpcMock.simulateTransaction
    sendTransaction = rpcMock.sendTransaction
    getTransaction = rpcMock.getTransaction
  }
  class HorizonServer {
    loadAccount = rpcMock.loadAccount
  }
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server,
      assembleTransaction: (tx: unknown) => ({ build: () => tx }),
    },
    Horizon: { ...actual.Horizon, Server: HorizonServer },
  }
})

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
      expect(
        validateMetadataUri('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
          .valid,
      ).toBe(true)
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

  describe('submitCreateProject on-chain execution with configured contract ID', () => {
    const creator = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
    const uri = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
    const hashHex = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    const contractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

    beforeEach(async () => {
      vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', contractId)
      const { Account } = await import('@stellar/stellar-sdk')
      rpcMock.loadAccount.mockResolvedValue(new Account(creator, '100'))
    })

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })

    it('throws NotWhitelistedError when simulation returns NotWhitelisted error', async () => {
      rpcMock.simulateTransaction.mockResolvedValue({
        error: 'HostError: Error(Contract, #1) - NotWhitelisted',
      })

      const mockSign = vi.fn()
      await expect(submitCreateProject(creator, uri, 0, hashHex, mockSign)).rejects.toThrow(
        NotWhitelistedError,
      )
    })

    it('throws URI error when simulation returns UriTooShort or InvalidUriScheme', async () => {
      rpcMock.simulateTransaction.mockResolvedValue({
        error: 'HostError: UriTooShort',
      })

      const mockSign = vi.fn()
      await expect(submitCreateProject(creator, uri, 0, hashHex, mockSign)).rejects.toThrow(
        /Registry URI validation failed/,
      )
    })

    it('throws Maturity error when simulation returns MaturityDateInPast', async () => {
      rpcMock.simulateTransaction.mockResolvedValue({
        error: 'HostError: MaturityDateInPast',
      })

      const mockSign = vi.fn()
      await expect(submitCreateProject(creator, uri, 0, hashHex, mockSign)).rejects.toThrow(
        /Maturity date must be in the future/,
      )
    })

    it('throws generic Simulation failed error on unexpected simulation errors', async () => {
      rpcMock.simulateTransaction.mockResolvedValue({
        error: 'SomeInternalLedgerError',
      })

      const mockSign = vi.fn()
      await expect(submitCreateProject(creator, uri, 0, hashHex, mockSign)).rejects.toThrow(
        /Simulation failed: SomeInternalLedgerError/,
      )
    })

    it('throws Contract error when retval contains an error object', async () => {
      const { nativeToScVal } = await import('@stellar/stellar-sdk')
      rpcMock.simulateTransaction.mockResolvedValue({
        result: {
          retval: nativeToScVal({ error: 'invalid_permissions' }),
        },
      })

      const mockSign = vi.fn()
      await expect(submitCreateProject(creator, uri, 0, hashHex, mockSign)).rejects.toThrow(
        /Contract error:/,
      )
    })

    it('throws error when sendTransaction returns ERROR status', async () => {
      const { Account, TransactionBuilder, Networks } = await import('@stellar/stellar-sdk')
      const acc = new Account(creator, '100')
      const dummyTx = new TransactionBuilder(acc, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(100)
        .build()

      rpcMock.simulateTransaction.mockResolvedValue({})
      rpcMock.sendTransaction.mockResolvedValue({
        status: 'ERROR',
        errorResult: 'tx_failed',
      })

      const mockSign = vi.fn().mockResolvedValue(dummyTx.toXDR())
      await expect(submitCreateProject(creator, uri, 0, hashHex, mockSign)).rejects.toThrow(
        /Send transaction failed/,
      )
    })

    it('successfully submits and polls transaction until confirmed', async () => {
      const { Account, TransactionBuilder, Networks, xdr, rpc } =
        await import('@stellar/stellar-sdk')
      const acc = new Account(creator, '100')
      const dummyTx = new TransactionBuilder(acc, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(100)
        .build()

      rpcMock.simulateTransaction.mockResolvedValue({})
      rpcMock.sendTransaction.mockResolvedValue({
        status: 'PENDING',
        hash: 'txhash123',
      })
      rpcMock.getTransaction.mockResolvedValue({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        returnValue: xdr.ScVal.scvU32(99),
      })

      const mockSign = vi.fn().mockResolvedValue(dummyTx.toXDR())
      const res = await submitCreateProject(creator, uri, 0, hashHex, mockSign)

      expect(res.projectId).toBe(99)
      expect(res.hash).toBe('txhash123')
    })

    it('throws error when transaction polling reports FAILED status', async () => {
      const { Account, TransactionBuilder, Networks, rpc } = await import('@stellar/stellar-sdk')
      const acc = new Account(creator, '100')
      const dummyTx = new TransactionBuilder(acc, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(100)
        .build()

      rpcMock.simulateTransaction.mockResolvedValue({})
      rpcMock.sendTransaction.mockResolvedValue({
        status: 'PENDING',
        hash: 'txhash123',
      })
      rpcMock.getTransaction.mockResolvedValue({
        status: rpc.Api.GetTransactionStatus.FAILED,
      })

      const mockSign = vi.fn().mockResolvedValue(dummyTx.toXDR())
      await expect(submitCreateProject(creator, uri, 0, hashHex, mockSign)).rejects.toThrow(
        /Transaction failed on-chain/,
      )
    })
  })
})
