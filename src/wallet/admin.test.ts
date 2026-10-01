import { describe, it, expect } from 'vitest'
import {
  validateProjectId,
  buildFundProjectArgs,
  buildUpdateScoresArgs,
  buildFundProjectCall,
  buildUpdateScoresCall,
} from './admin'

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
      // i128 value check
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

describe('Admin Multisig Method Alignment & Argument Building (Issue #689)', () => {
  const SIGNER_1 = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
  const SIGNER_2 = 'GCMRTJ2F7U4THN6VWWNA5GO6WLPPBY6NI5SFBQKLPKTZHY7KPVX6M7MT'

  describe('buildFundProjectCall', () => {
    it('uses fund_project with 2 arguments when no approvals (non-multisig)', () => {
      const call = buildFundProjectCall(1, 10_000_000n, [])
      expect(call.method).toBe('fund_project')
      expect(call.args).toHaveLength(2)
    })

    it('uses fund_project_with_approvals with Vec<Address> when approvals present (multisig)', () => {
      const call = buildFundProjectCall(1, 10_000_000n, [SIGNER_1, SIGNER_2])
      expect(call.method).toBe('fund_project_with_approvals')
      expect(call.args).toHaveLength(3)
      expect(call.args[2]).toBeDefined()
    })
  })

  describe('buildUpdateScoresCall', () => {
    it('uses update_impact_score with 3 arguments when no approvals (non-multisig)', () => {
      const call = buildUpdateScoresCall(1, 80, 90, [])
      expect(call.method).toBe('update_impact_score')
      expect(call.args).toHaveLength(3)
    })

    it('uses update_impact_score_approved with 4 arguments (including approvals Vec) when approvals present', () => {
      const call = buildUpdateScoresCall(1, 80, 90, [SIGNER_1])
      expect(call.method).toBe('update_impact_score_approved')
      expect(call.args).toHaveLength(4)
      expect(call.args[3]).toBeDefined()
    })
  })
})
