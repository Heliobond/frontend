import { describe, it, expect, beforeEach } from 'vitest'
import {
  getPendingClaims,
  addPendingClaim,
  removePendingClaim,
  clearPendingClaims,
} from './pendingClaims'

describe('pendingClaims storage', () => {
  beforeEach(() => {
    clearPendingClaims()
  })

  it('stores and retrieves pending claims across reloads', () => {
    expect(getPendingClaims()).toEqual([])

    addPendingClaim({
      id: 'claim-1',
      hash: '0xabc123',
      amount: 150,
      timestamp: 1700000000000,
      address: 'GUSER123',
    })

    const claims = getPendingClaims()
    expect(claims).toHaveLength(1)
    expect(claims[0].amount).toBe(150)
    expect(claims[0]).not.toHaveProperty('position')
  })

  it('stores queued claims when the owed amount is unavailable', () => {
    addPendingClaim({
      id: 'claim-1',
      hash: '0xabc123',
      timestamp: 1700000000000,
    })

    expect(getPendingClaims()).toEqual([
      { id: 'claim-1', hash: '0xabc123', timestamp: 1700000000000 },
    ])
  })

  it('filters claims by address', () => {
    addPendingClaim({
      id: 'claim-1',
      hash: '0xabc123',
      amount: 150,
      timestamp: 1700000000000,
      address: 'GUSER1',
    })
    addPendingClaim({
      id: 'claim-2',
      hash: '0xdef456',
      amount: 250,
      timestamp: 1700000001000,
      address: 'GUSER2',
    })

    expect(getPendingClaims('GUSER1')).toHaveLength(1)
    expect(getPendingClaims('GUSER1')[0].id).toBe('claim-1')
    expect(getPendingClaims('GUSER2')).toHaveLength(1)
    expect(getPendingClaims('GUSER2')[0].id).toBe('claim-2')
  })

  it('removes claims by hash or id', () => {
    addPendingClaim({
      id: 'claim-1',
      hash: '0xabc123',
      amount: 150,
      timestamp: 1700000000000,
    })

    removePendingClaim('claim-1')
    expect(getPendingClaims()).toHaveLength(0)
  })
})
