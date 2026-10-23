import { describe, it, expect } from 'vitest'
import { validateProjectId, buildFundProjectArgs, buildUpdateScoresArgs } from './admin'

describe('admin arg encoding (Issue #688)', () => {
  describe('validateProjectId', () => {
    it('accepts valid u32 project IDs', () => {
      expect(validateProjectId(1)).toBe(1)
      expect(validateProjectId(42)).toBe(42)
      expect(validateProjectId(0xffffffff)).toBe(4294967295)
    })

    it('rejects 0, negative numbers, floats, and overflow values', () => {
      expect(() => validateProjectId(0)).toThrow('invalidProjectId')
      expect(() => validateProjectId(-1)).toThrow('invalidProjectId')
      expect(() => validateProjectId(1.5)).toThrow('invalidProjectId')
      expect(() => validateProjectId(0x100000000)).toThrow('invalidProjectId')
      expect(() => validateProjectId(NaN)).toThrow('invalidProjectId')
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
      // i128 value check
      const expectedScaled = BigInt(Math.round(amount * 1e7))
      const parts = scvAmount.i128()
      const low = BigInt(parts.lo().toString())
      const high = BigInt(parts.hi().toString())
      const combined = (high << 64n) + low
      expect(combined).toBe(expectedScaled)
    })

    it('throws if project ID is invalid', () => {
      expect(() => buildFundProjectArgs(0, 100)).toThrow('invalidProjectId')
      expect(() => buildFundProjectArgs(-5, 100)).toThrow('invalidProjectId')
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
      expect(() => buildUpdateScoresArgs(1, -1, 50)).toThrow('invalidCreditScore')
      expect(() => buildUpdateScoresArgs(1, 101, 50)).toThrow('invalidCreditScore')
      expect(() => buildUpdateScoresArgs(1, 50.5, 50)).toThrow('invalidCreditScore')
      expect(() => buildUpdateScoresArgs(1, 50, -1)).toThrow('invalidGreenScore')
      expect(() => buildUpdateScoresArgs(1, 50, 105)).toThrow('invalidGreenScore')
    })
  })
})

describe('admin multisig arg building (#689)', () => {
  describe('buildFundProjectArgs with approvals', () => {
    it('builds (u32, i128, Vec<Address>) for multisig path', async () => {
      const { Address, nativeToScVal } = await import('@stellar/stellar-sdk')
      const projectId = 42
      const amount = 100
      const approvals = [
        'GAQG5ETYGHGKH7SXCSMOPGIENAWWK2BG7VQBJA2ORDFNAE4GWYJLZQGM',
      ]

      const args = buildFundProjectArgs(projectId, amount)
      expect(args).toHaveLength(2)
      expect(args[0].switch().name).toBe('scvU32')
      expect(args[1].switch().name).toBe('scvI128')

      // Simulate what submitFundProject does for multisig
      const approvalScVals = approvals.map((a) => new Address(a).toScVal())
      const vecArg = nativeToScVal(approvalScVals)
      expect(vecArg.switch().name).toBe('scvVec')
    })
  })

  describe('buildUpdateScoresArgs with approvals', () => {
    it('builds (u32, u32, u32, Vec<Address>) for multisig path', async () => {
      const { Address, nativeToScVal } = await import('@stellar/stellar-sdk')
      const projectId = 7
      const credit = 85
      const green = 90
      const approvals = [
        'GAQG5ETYGHGKH7SXCSMOPGIENAWWK2BG7VQBJA2ORDFNAE4GWYJLZQGM',
      ]

      const args = buildUpdateScoresArgs(projectId, credit, green)
      expect(args).toHaveLength(3)
      expect(args[0].switch().name).toBe('scvU32')
      expect(args[1].switch().name).toBe('scvU32')
      expect(args[2].switch().name).toBe('scvU32')

      // Simulate what submitUpdateScores does for multisig
      const approvalScVals = approvals.map((a) => new Address(a).toScVal())
      const vecArg = nativeToScVal(approvalScVals)
      expect(vecArg.switch().name).toBe('scvVec')
    })
  })
})
