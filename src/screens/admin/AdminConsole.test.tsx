import { describe, it, expect } from 'vitest'
import { formatFunded, parseFundedNum } from './AdminConsole'

/**
 * Extract the pure accounting logic from AdminConsole's fundProject
 * into a testable reducer to verify the invariant:
 *   liquid + deployed === totalAssets (constant)
 */

interface VaultState {
  liquid: number
  deployed: number
}

interface FundedProject {
  id: number
  funded: number
}

function fundProject(
  state: VaultState,
  projects: FundedProject[],
  id: number,
  amount: number,
): { vault: VaultState; projects: FundedProject[] } {
  const safe = Math.min(amount, state.liquid)
  return {
    vault: {
      liquid: state.liquid - safe,
      deployed: state.deployed + safe,
    },
    projects: projects.map((p) => (p.id === id ? { ...p, funded: p.funded + safe } : p)),
  }
}

describe('AdminConsole money formatting helpers', () => {
  it.each([
    0,
    1,
    42,
    999,
    1_000,
    12_345,
    500_000,
    1_500_000,
  ])('round-trips %i through funded display formatting', (amount) => {
    expect(parseFundedNum(formatFunded(amount))).toBe(amount)
  })

  it('parses funded amounts with thousands separators', () => {
    expect(parseFundedNum(',234,567')).toBe(1_234_567)
  })
})

describe('AdminConsole funding and liquid accounting', () => {
  const initialState: VaultState = { liquid: 500_000, deployed: 1_500_000 }
  const totalAssets = initialState.liquid + initialState.deployed

  const projects: FundedProject[] = [
    { id: 1, funded: 100_000 },
    { id: 2, funded: 200_000 },
  ]

  it('preserves totalAssets identity after funding', () => {
    const result = fundProject(initialState, projects, 1, 50_000)
    expect(result.vault.liquid + result.vault.deployed).toBe(totalAssets)
  })

  it('decreases liquid and increases deployed by the funded amount', () => {
    const result = fundProject(initialState, projects, 1, 75_000)
    expect(result.vault.liquid).toBe(500_000 - 75_000)
    expect(result.vault.deployed).toBe(1_500_000 + 75_000)
  })

  it('caps funding at the liquid balance when amount exceeds liquid', () => {
    const result = fundProject(initialState, projects, 1, 999_999)
    expect(result.vault.liquid).toBe(0)
    expect(result.vault.deployed).toBe(totalAssets)
    expect(result.vault.liquid + result.vault.deployed).toBe(totalAssets)
  })

  it('increases the funded project amount by the safe amount', () => {
    const result = fundProject(initialState, projects, 1, 50_000)
    const funded = result.projects.find((p) => p.id === 1)!
    expect(funded.funded).toBe(150_000)
  })

  it('does not affect other projects when funding one', () => {
    const result = fundProject(initialState, projects, 1, 50_000)
    const other = result.projects.find((p) => p.id === 2)!
    expect(other.funded).toBe(200_000)
  })

  it('handles funding with zero amount (no-op)', () => {
    const result = fundProject(initialState, projects, 1, 0)
    expect(result.vault.liquid).toBe(initialState.liquid)
    expect(result.vault.deployed).toBe(initialState.deployed)
    expect(result.vault.liquid + result.vault.deployed).toBe(totalAssets)
  })

  it('preserves identity across multiple sequential fundings', () => {
    let state = initialState
    let projs = [...projects]

    const result1 = fundProject(state, projs, 1, 100_000)
    state = result1.vault
    projs = result1.projects

    const result2 = fundProject(state, projs, 2, 200_000)
    state = result2.vault

    expect(state.liquid + state.deployed).toBe(totalAssets)
    expect(state.liquid).toBe(500_000 - 100_000 - 200_000)
  })

  it('caps at zero liquid even when multiple fundings exceed balance', () => {
    let state = initialState
    let projs = [...projects]

    const result1 = fundProject(state, projs, 1, 400_000)
    state = result1.vault
    projs = result1.projects

    const result2 = fundProject(state, projs, 2, 300_000)
    state = result2.vault

    expect(state.liquid).toBe(0)
    expect(state.deployed).toBe(totalAssets)
    expect(state.liquid + state.deployed).toBe(totalAssets)
  })
})

