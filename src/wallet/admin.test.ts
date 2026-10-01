import { describe, it, expect } from 'vitest'
import { buildFundProjectCall, buildUpdateScoresCall } from './admin'

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
