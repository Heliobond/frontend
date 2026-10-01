import { describe, it, expect, beforeEach } from 'vitest'
import { Address } from '@stellar/stellar-sdk'
import { buildSetPausedCall } from './admin'

describe('Admin Pause & Circuit Breaker controls (Issue #695)', () => {
  const VAULT_ADDR = 'CCWG4L5IJ5Y36YBGKLUGMPLL6RXJUSRIXP67EV3VFHPAZZO56CJJTQYD'
  const REGISTRY_ADDR = 'CBE75HS6PXI3C7LMUINZZNN2B3JAQ3ETOUOQT4H7XTEL5NCRJW4Z33BY'
  const ADMIN_ADDR = 'GCVIMAOPBRGVPOO7BSEO5OAAQ7S3CFPZSBZVCJALT4R6Q2WB473X5RQL'

  beforeEach(() => {
    process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID = VAULT_ADDR
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = REGISTRY_ADDR
  })

  it('builds pause() call on vault without arguments when pausing', () => {
    const call = buildSetPausedCall('vault', true, ADMIN_ADDR, false)
    expect(call.contractId).toBe(VAULT_ADDR)
    expect(call.method).toBe('pause')
    expect(call.args).toEqual([]) // Must have NO arguments
  })

  it('builds unpause() call on registry without arguments when unpausing', () => {
    const call = buildSetPausedCall('registry', false, ADMIN_ADDR, false)
    expect(call.contractId).toBe(REGISTRY_ADDR)
    expect(call.method).toBe('unpause')
    expect(call.args).toEqual([]) // Must have NO arguments
  })

  it('builds emergency_pause with caller address argument in emergency mode', () => {
    const call = buildSetPausedCall('vault', true, ADMIN_ADDR, true)
    expect(call.contractId).toBe(VAULT_ADDR)
    expect(call.method).toBe('emergency_pause')
    expect(call.args).toHaveLength(1)
    expect(Address.fromScVal(call.args[0]).toString()).toBe(ADMIN_ADDR)
  })

  it('builds emergency_unpause with caller address argument in emergency mode', () => {
    const call = buildSetPausedCall('registry', false, ADMIN_ADDR, true)
    expect(call.contractId).toBe(REGISTRY_ADDR)
    expect(call.method).toBe('emergency_unpause')
    expect(call.args).toHaveLength(1)
    expect(Address.fromScVal(call.args[0]).toString()).toBe(ADMIN_ADDR)
  })
})
