import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Address } from '@stellar/stellar-sdk'
import {
  buildSetPausedCall,
  submitSetPaused,
  submitPause,
  fetchIsPaused,
  validateProjectId,
  buildFundProjectArgs,
  buildUpdateScoresArgs,
} from './admin'

describe('Admin Pause & Circuit Breaker controls (Issue #695)', () => {
  const VAULT_ADDR = 'CCWG4L5IJ5Y36YBGKLUGMPLL6RXJUSRIXP67EV3VFHPAZZO56CJJTQYD'
  const REGISTRY_ADDR = 'CBE75HS6PXI3C7LMUINZZNN2B3JAQ3ETOUOQT4H7XTEL5NCRJW4Z33BY'
  const ADMIN_ADDR = 'GCVIMAOPBRGVPOO7BSEO5OAAQ7S3CFPZSBZVCJALT4R6Q2WB473X5RQL'

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID = VAULT_ADDR
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = REGISTRY_ADDR
  })

  describe('buildSetPausedCall', () => {
    it('builds vault pause call with no arguments', async () => {
      const call = await buildSetPausedCall('vault', true, ADMIN_ADDR)
      expect(call.contractId).toBe(VAULT_ADDR)
      expect(call.method).toBe('pause')
      expect(call.args).toHaveLength(0) // On-chain pause takes NO arguments
    })

    it('builds vault unpause call with no arguments', async () => {
      const call = await buildSetPausedCall('vault', false, ADMIN_ADDR)
      expect(call.contractId).toBe(VAULT_ADDR)
      expect(call.method).toBe('unpause')
      expect(call.args).toHaveLength(0) // On-chain unpause takes NO arguments
    })

    it('builds registry pause call with no arguments', async () => {
      const call = await buildSetPausedCall('registry', true, ADMIN_ADDR)
      expect(call.contractId).toBe(REGISTRY_ADDR)
      expect(call.method).toBe('pause')
      expect(call.args).toHaveLength(0)
    })

    it('builds registry unpause call with no arguments', async () => {
      const call = await buildSetPausedCall('registry', false, ADMIN_ADDR)
      expect(call.contractId).toBe(REGISTRY_ADDR)
      expect(call.method).toBe('unpause')
      expect(call.args).toHaveLength(0)
    })

    it('builds emergency pause call passing caller address', async () => {
      const call = await buildSetPausedCall('vault', true, ADMIN_ADDR, true)
      expect(call.contractId).toBe(VAULT_ADDR)
      expect(call.method).toBe('emergency_pause')
      expect(call.args).toHaveLength(1)
      expect(call.args[0]).toEqual(new Address(ADMIN_ADDR).toScVal())
    })

    it('builds emergency unpause call passing caller address', async () => {
      const call = await buildSetPausedCall('registry', false, ADMIN_ADDR, true)
      expect(call.contractId).toBe(REGISTRY_ADDR)
      expect(call.method).toBe('emergency_unpause')
      expect(call.args).toHaveLength(1)
      expect(call.args[0]).toEqual(new Address(ADMIN_ADDR).toScVal())
    })
  })

  describe('submitSetPaused and submitPause', () => {
    it('executes submitSetPaused with simulated fallback when contract ID unset', async () => {
      delete process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
      const sign = vi.fn().mockResolvedValue('signed-xdr')
      const result = await submitSetPaused('vault', true, ADMIN_ADDR, sign)
      expect(result.hash).toBeDefined()
    })

    it('delegates submitPause to submitSetPaused for vault', async () => {
      delete process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
      const sign = vi.fn().mockResolvedValue('signed-xdr')
      const result = await submitPause(true, ADMIN_ADDR, sign)
      expect(result.hash).toBeDefined()
    })
  })

  describe('fetchIsPaused fallback and demo handling', () => {
    it('returns false when contract ID is not configured', async () => {
      delete process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
      const isPaused = await fetchIsPaused('vault')
      expect(isPaused).toBe(false)
    })
  })
})

describe('admin arg encoding (Issue #688)', () => {
  describe('validateProjectId', () => {
    it('accepts valid u32 project IDs', () => {
      expect(validateProjectId(1)).toBe(1)
      expect(validateProjectId(42)).toBe(42)
      expect(validateProjectId(0xffffffff)).toBe(4294967295)
    })

    it('rejects 0, negative numbers, floats, and overflow values', () => {
      expect(() => validateProjectId(0)).toThrow('Invalid project ID')
      expect(() => validateProjectId(-1)).toThrow('Invalid project ID')
      expect(() => validateProjectId(1.5)).toThrow('Invalid project ID')
      expect(() => validateProjectId(0x100000000)).toThrow('Invalid project ID')
      expect(() => validateProjectId(NaN)).toThrow('Invalid project ID')
    })
  })

  describe('buildFundProjectArgs', () => {
    it('encodes arguments as (u32, i128)', () => {
      const projectId = 42
      const amount = 100 // 100 USDC -> 100 * 1e7
      const [scvProject, scvAmount] = buildFundProjectArgs(projectId, amount)

      expect(scvProject.switch().name).toBe('scvU32')
      expect(scvProject.u32()).toBe(42)

      expect(scvAmount.switch().name).toBe('scvI128')
      const expectedScaled = BigInt(Math.round(amount * 1e7))
      const parts = scvAmount.i128()
      const low = BigInt(parts.lo().toString())
      const high = BigInt(parts.hi().toString())
      const combined = (high << 64n) + low
      expect(combined).toBe(expectedScaled)
    })

    it('throws if project ID is invalid', () => {
      expect(() => buildFundProjectArgs(0, 100)).toThrow('Invalid project ID')
      expect(() => buildFundProjectArgs(-5, 100)).toThrow('Invalid project ID')
    })
  })

  describe('buildUpdateScoresArgs', () => {
    it('encodes arguments as (u32, u32, u32)', () => {
      const projectId = 7
      const credit = 85
      const green = 90
      const [scvProject, scvCredit, scvGreen] = buildUpdateScoresArgs(projectId, credit, green)

      expect(scvProject.switch().name).toBe('scvU32')
      expect(scvProject.u32()).toBe(7)

      expect(scvCredit.switch().name).toBe('scvU32')
      expect(scvCredit.u32()).toBe(85)

      expect(scvGreen.switch().name).toBe('scvU32')
      expect(scvGreen.u32()).toBe(90)
    })

    it('rejects scores out of [0, 100] or non-integers', () => {
      expect(() => buildUpdateScoresArgs(1, -1, 50)).toThrow('Invalid credit score')
      expect(() => buildUpdateScoresArgs(1, 101, 50)).toThrow('Invalid credit score')
      expect(() => buildUpdateScoresArgs(1, 50.5, 50)).toThrow('Invalid credit score')
      expect(() => buildUpdateScoresArgs(1, 50, -1)).toThrow('Invalid green score')
      expect(() => buildUpdateScoresArgs(1, 50, 105)).toThrow('Invalid green score')
    })
  })
})
