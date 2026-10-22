// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type * as StellarSdkTypes from '@stellar/stellar-sdk'

// ---------------------------------------------------------------------------
// Hoisted mock state and @stellar/stellar-sdk mock
// ---------------------------------------------------------------------------

export interface RecordedContractCall {
  contractId: string
  method: string
  args: StellarSdkTypes.xdr.ScVal[]
}

const mockState = vi.hoisted(() => ({
  recordedCalls: [] as RecordedContractCall[],
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
  loadAccount: vi.fn(),
}))

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()

  // Intercept Contract.prototype.call to record (contractId, method, args)
  const originalCall = actual.Contract.prototype.call
  actual.Contract.prototype.call = function (
    this: StellarSdkTypes.Contract,
    method: string,
    ...args: StellarSdkTypes.xdr.ScVal[]
  ) {
    const contractId = this.address().toString()
    mockState.recordedCalls.push({ contractId, method, args })
    return originalCall.apply(this, [method, ...args])
  }

  class MockServer {
    simulateTransaction = mockState.simulateTransaction
    sendTransaction = mockState.sendTransaction
    getTransaction = mockState.getTransaction
  }

  class MockHorizonServer {
    loadAccount = mockState.loadAccount
    fetchBaseFee = vi.fn().mockResolvedValue(100)
  }

  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: MockServer,
      assembleTransaction: (tx: StellarSdkTypes.Transaction) => ({
        build: () => tx,
      }),
    },
    Horizon: {
      ...actual.Horizon,
      Server: MockHorizonServer,
    },
  }
})

import * as sdk from '@stellar/stellar-sdk'

// ---------------------------------------------------------------------------
// Contract Spec Types & Fixture Loader
// ---------------------------------------------------------------------------

export interface SCSpecFunctionInputV0 {
  doc?: string
  name: string
  type_: string | Record<string, unknown>
}

export interface SCSpecFunctionV0 {
  doc?: string
  name: string
  inputs: SCSpecFunctionInputV0[]
  outputs?: unknown[]
}

export interface SCSpecEntry {
  function_v0?: SCSpecFunctionV0
}

const FIXTURES_DIR = path.resolve(__dirname, '../test/fixtures/contracts')

export function loadContractSpec(fileName: string): SCSpecEntry[] {
  const filePath = path.join(FIXTURES_DIR, fileName)
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as SCSpecEntry[]
}

export function indexContractFunctions(entries: SCSpecEntry[]): Map<string, SCSpecFunctionV0> {
  const map = new Map<string, SCSpecFunctionV0>()
  for (const entry of entries) {
    if (entry.function_v0) {
      map.set(entry.function_v0.name, entry.function_v0)
    }
  }
  return map
}

const vaultSpecEntries = loadContractSpec('investment_vault.spec.json')
const registrySpecEntries = loadContractSpec('project_registry.spec.json')

export const vaultFunctions = indexContractFunctions(vaultSpecEntries)
export const registryFunctions = indexContractFunctions(registrySpecEntries)

// ---------------------------------------------------------------------------
// ScVal & Type Matching Utilities
// ---------------------------------------------------------------------------

export function normalizeSpecType(typeDef: string | Record<string, unknown>): string {
  if (typeof typeDef === 'string') {
    return typeDef.toLowerCase()
  }
  if (typeDef && typeof typeDef === 'object') {
    if ('valuetype' in typeDef && typeof typeDef.valuetype === 'string') {
      return typeDef.valuetype.toLowerCase()
    }
    if ('type' in typeDef && typeof typeDef.type === 'string') {
      return typeDef.type.toLowerCase()
    }
    const keys = Object.keys(typeDef)
    if (keys.length > 0) {
      return keys[0].toLowerCase()
    }
  }
  return 'unknown'
}

export function scValToSpecType(val: sdk.xdr.ScVal): string {
  const switchName = val.switch().name
  switch (switchName) {
    case 'scvU32':
      return 'u32'
    case 'scvI128':
      return 'i128'
    case 'scvAddress':
      return 'address'
    case 'scvBool':
      return 'bool'
    case 'scvU64':
      return 'u64'
    case 'scvString':
      return 'string'
    case 'scvBytes':
      return 'bytes'
    case 'scvVec':
      return 'vec'
    case 'scvMap':
      return 'map'
    case 'scvI32':
      return 'i32'
    case 'scvI64':
      return 'i64'
    case 'scvU128':
      return 'u128'
    default:
      return switchName.toLowerCase()
  }
}

export function areTypesCompatible(actualType: string, expectedType: string): boolean {
  if (actualType === expectedType) return true
  if (actualType === 'bytes' && (expectedType === 'bytes_n' || expectedType === 'bytes'))
    return true
  if (actualType === 'vec' && (expectedType === 'vec' || expectedType === 'tuple')) return true
  if (expectedType === 'udt') return true
  if (expectedType === 'option') return true
  return false
}

/**
 * Validates a recorded Contract.call against the corresponding deployed ABI fixture.
 * Throws descriptive errors if the method is missing, or arguments count/types mismatch.
 */
export function assertContractCallMatchesSpec(
  call: RecordedContractCall,
  targetSpec: 'investment_vault' | 'project_registry' | 'auto',
  vaultId: string,
  registryId: string,
): void {
  let specMap: Map<string, SCSpecFunctionV0>
  let contractName: string

  if (targetSpec === 'investment_vault' || (targetSpec === 'auto' && call.contractId === vaultId)) {
    specMap = vaultFunctions
    contractName = 'InvestmentVault'
  } else if (
    targetSpec === 'project_registry' ||
    (targetSpec === 'auto' && call.contractId === registryId)
  ) {
    specMap = registryFunctions
    contractName = 'ProjectRegistry'
  } else {
    specMap = vaultFunctions
    contractName = 'InvestmentVault'
  }

  const specFn = specMap.get(call.method)
  if (!specFn) {
    throw new Error(`Method '${call.method}' not found in contract spec for ${contractName}`)
  }

  if (call.args.length !== specFn.inputs.length) {
    throw new Error(
      `Argument count mismatch for method '${call.method}' on ${contractName}: expected ${specFn.inputs.length}, received ${call.args.length}`,
    )
  }

  for (let i = 0; i < call.args.length; i++) {
    const actualScVal = call.args[i]
    const actualType = scValToSpecType(actualScVal)
    const expectedType = normalizeSpecType(specFn.inputs[i].type_)

    if (!areTypesCompatible(actualType, expectedType)) {
      throw new Error(
        `Argument type mismatch for method '${call.method}' on ${contractName} at position ${i} ('${specFn.inputs[i].name}'): expected '${expectedType}', received '${actualType}' (${actualScVal.switch().name})`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Contract Spec Fixture & ABI Matching (Issue #719)', () => {
  // Valid StrKey C-addresses for Soroban contracts
  const VAULT_ID = sdk.StrKey.encodeContract(Buffer.alloc(32, 1))
  const REGISTRY_ID = sdk.StrKey.encodeContract(Buffer.alloc(32, 2))
  const TEST_ACCOUNT = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
  const mockSign = async (xdr: unknown) =>
    typeof xdr === 'string' ? xdr : Buffer.from(xdr as Uint8Array).toString('base64')

  beforeEach(() => {
    mockState.recordedCalls = []
    process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID = VAULT_ID
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = REGISTRY_ID
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'testnet'
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'http://localhost:8000/rpc'
    process.env.NEXT_PUBLIC_HORIZON_URL = 'http://localhost:8000'

    // Mock RPC simulation retval
    mockState.simulateTransaction.mockReset().mockResolvedValue({
      result: {
        retval: sdk.nativeToScVal(10000000n, { type: 'i128' }),
        auth: [],
      },
      minResourceFee: '100',
    })

    // Mock sendTransaction
    mockState.sendTransaction
      .mockReset()
      .mockImplementation((signedTx: StellarSdkTypes.Transaction) => ({
        status: 'SUCCESS',
        hash: signedTx?.hash ? signedTx.hash().toString('hex') : 'mock-tx-hash-001',
      }))

    // Mock getTransaction polling
    mockState.getTransaction.mockReset().mockResolvedValue({
      status: sdk.rpc.Api.GetTransactionStatus.SUCCESS,
      returnValue: sdk.nativeToScVal(10000000n, { type: 'i128' }),
    })

    // Mock loadAccount
    mockState.loadAccount.mockReset().mockResolvedValue(new sdk.Account(TEST_ACCOUNT, '1'))
  })

  afterEach(() => {
    // Validate every invocation captured during the test, including calls a test
    // did not explicitly select by method name.
    for (const call of mockState.recordedCalls) {
      assertContractCallMatchesSpec(call, 'auto', VAULT_ID, REGISTRY_ID)
    }
    mockState.recordedCalls = []
  })

  describe('Fixtures and SHA integrity', () => {
    it('loads valid investment_vault and project_registry spec fixtures', () => {
      expect(vaultFunctions.size).toBeGreaterThan(30)
      expect(registryFunctions.size).toBeGreaterThan(20)

      expect(vaultFunctions.has('deposit')).toBe(true)
      expect(vaultFunctions.has('withdraw')).toBe(true)
      expect(vaultFunctions.has('claim')).toBe(true)
      expect(vaultFunctions.has('total_assets')).toBe(true)

      expect(registryFunctions.has('total_projects')).toBe(true)
      expect(registryFunctions.has('get_projects_page')).toBe(true)
      expect(registryFunctions.has('get_project')).toBe(true)
      expect(registryFunctions.has('get_score_history')).toBe(true)
    })

    it('records source contracts commit SHA in COMMIT_SHA fixture', () => {
      const shaPath = path.join(FIXTURES_DIR, 'COMMIT_SHA')
      expect(fs.existsSync(shaPath)).toBe(true)
      const sha = fs.readFileSync(shaPath, 'utf-8').trim()
      expect(sha).toMatch(/^[0-9a-f]{40}$/)
    })
  })

  describe('InvestmentVault (src/wallet/vault.ts)', () => {
    it('fetchSharePrice calls convert_to_assets with matching ABI', async () => {
      const { fetchSharePrice } = await import('./vault')
      await fetchSharePrice(TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'convert_to_assets')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('fetchTotalAssets calls total_assets with matching ABI', async () => {
      const { fetchTotalAssets } = await import('./vault')
      await fetchTotalAssets(TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'total_assets')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('fetchUtilizationBps calls get_utilization_bps with matching ABI', async () => {
      const { fetchUtilizationBps } = await import('./vault')
      await fetchUtilizationBps(TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'get_utilization_bps')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('fetchPortfolio calls get_portfolio with matching ABI', async () => {
      const { fetchPortfolio } = await import('./vault')
      await fetchPortfolio(TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'get_portfolio')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('fetchClaimableYield calls claimable_yield with matching ABI', async () => {
      const { fetchClaimableYield } = await import('./vault')
      await fetchClaimableYield(TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'claimable_yield')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('estimateTransactionFee(deposit) calls deposit with matching ABI', async () => {
      const { estimateTransactionFee } = await import('./vault')
      await estimateTransactionFee('deposit', 100, TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'deposit')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('estimateTransactionFee(withdraw) calls withdraw with matching ABI', async () => {
      const { estimateTransactionFee } = await import('./vault')
      await estimateTransactionFee('withdraw', 100, TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'withdraw')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('submitDeposit calls deposit with matching ABI', async () => {
      const { submitDeposit } = await import('./vault')
      await submitDeposit(100, TEST_ACCOUNT, mockSign).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'deposit')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('submitWithdraw calls withdraw with matching ABI', async () => {
      const { submitWithdraw } = await import('./vault')
      await submitWithdraw(100, TEST_ACCOUNT, mockSign).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'withdraw')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('submitClaim calls claim with matching ABI', async () => {
      const { submitClaim } = await import('./vault')
      await submitClaim(TEST_ACCOUNT, mockSign).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'claim')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('submitClaimYield calls claim_yield with matching ABI', async () => {
      const { submitClaimYield } = await import('./vault')
      await submitClaimYield(TEST_ACCOUNT, mockSign).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'claim_yield')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })
  })

  describe('ProjectRegistry (src/wallet/registry.ts)', () => {
    it('defaultSimulateRegistryCall(total_projects) calls total_projects with matching ABI', async () => {
      const { defaultSimulateRegistryCall } = await import('./registry')
      await defaultSimulateRegistryCall('total_projects', [], TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'total_projects')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'project_registry', VAULT_ID, REGISTRY_ID)
    })

    it('defaultSimulateRegistryCall(get_projects_page) calls get_projects_page with matching ABI', async () => {
      const { defaultSimulateRegistryCall } = await import('./registry')
      await defaultSimulateRegistryCall('get_projects_page', [0, 10], TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'get_projects_page')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'project_registry', VAULT_ID, REGISTRY_ID)
    })

    it('defaultSimulateRegistryCall(get_project) calls get_project with matching ABI', async () => {
      const { defaultSimulateRegistryCall } = await import('./registry')
      await defaultSimulateRegistryCall('get_project', [1], TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'get_project')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'project_registry', VAULT_ID, REGISTRY_ID)
    })

    it('defaultSimulateRegistryCall(get_score_history) calls get_score_history with matching ABI', async () => {
      const { defaultSimulateRegistryCall } = await import('./registry')
      await defaultSimulateRegistryCall('get_score_history', [1], TEST_ACCOUNT).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'get_score_history')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'project_registry', VAULT_ID, REGISTRY_ID)
    })
  })

  describe('Admin (src/wallet/admin.ts)', () => {
    it('submitFundProject with isMultisig=false calls fund_project with matching ABI', async () => {
      const { submitFundProject } = await import('./admin')
      await submitFundProject(1, 100, TEST_ACCOUNT, mockSign, false).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'fund_project')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('submitUpdateScores with isMultisig=false calls update_impact_score with matching ABI', async () => {
      const { submitUpdateScores } = await import('./admin')
      await submitUpdateScores(1, 80, 90, TEST_ACCOUNT, mockSign, false).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'update_impact_score')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'project_registry', VAULT_ID, REGISTRY_ID)
    })

    it('submitSetWhitelist with isMultisig=false calls set_whitelist with matching ABI', async () => {
      const { submitSetWhitelist } = await import('./admin')
      await submitSetWhitelist(TEST_ACCOUNT, true, TEST_ACCOUNT, mockSign, false).catch(() => {})

      const call = mockState.recordedCalls.find((c) => c.method === 'set_whitelist')
      expect(call).toBeDefined()
      assertContractCallMatchesSpec(call!, 'project_registry', VAULT_ID, REGISTRY_ID)
    })

    it.fails(
      'getAdminRoles also probes get_owner, which is absent from both contract ABIs',
      async () => {
        const { getAdminRoles } = await import('./admin')
        await getAdminRoles(TEST_ACCOUNT).catch(() => {})

        const call = mockState.recordedCalls.find((c) => c.method === 'get_whitelister')
        expect(call).toBeDefined()
        assertContractCallMatchesSpec(call!, 'project_registry', VAULT_ID, REGISTRY_ID)
      },
    )
  })

  describe('Admin ABI mismatches on current main (marked it.fails per acceptance criteria)', () => {
    // 1. isMultisigDeployment calls non-existent function 'is_multisig' (Issue #719)
    it.fails(
      'reports mismatch: admin.ts calls non-existent method is_multisig (#719)',
      async () => {
        const { isMultisigDeployment } = await import('./admin')
        await isMultisigDeployment(TEST_ACCOUNT).catch(() => {})

        const call = mockState.recordedCalls.find((c) => c.method === 'is_multisig')
        expect(call).toBeDefined()
        // Must fail because is_multisig does not exist in the contract ABI (contract uses get_multisig_admin)
        assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
      },
    )

    // 2. submitFundProject with isMultisig: true calls non-existent 'fund_project_approved' (Issue #719)
    it.fails(
      'reports mismatch: admin.ts calls non-existent method fund_project_approved (#719)',
      async () => {
        const { submitFundProject } = await import('./admin')
        await submitFundProject(1, 100, TEST_ACCOUNT, mockSign, true).catch(() => {})

        const call = mockState.recordedCalls.find((c) => c.method === 'fund_project_approved')
        expect(call).toBeDefined()
        // Must fail because the contract defines fund_project_with_approvals, not fund_project_approved
        assertContractCallMatchesSpec(call!, 'investment_vault', VAULT_ID, REGISTRY_ID)
      },
    )

    // 3. pause() and unpause() take 0 arguments; the emergency variants take the caller (#719, #695)
    it('calls pause() and unpause() with no arguments, matching the spec', async () => {
      const { submitSetPaused } = await import('./admin')
      await submitSetPaused('vault', true, TEST_ACCOUNT, mockSign)
      await submitSetPaused('vault', false, TEST_ACCOUNT, mockSign)

      const pauseCall = mockState.recordedCalls.find((c) => c.method === 'pause')
      const unpauseCall = mockState.recordedCalls.find((c) => c.method === 'unpause')
      expect(pauseCall?.args).toHaveLength(0)
      expect(unpauseCall?.args).toHaveLength(0)
      assertContractCallMatchesSpec(pauseCall!, 'investment_vault', VAULT_ID, REGISTRY_ID)
      assertContractCallMatchesSpec(unpauseCall!, 'investment_vault', VAULT_ID, REGISTRY_ID)
    })

    it('calls emergency_pause with the caller address, matching the spec', async () => {
      const { submitSetPaused } = await import('./admin')
      await submitSetPaused('registry', true, TEST_ACCOUNT, mockSign, { emergency: true })

      const call = mockState.recordedCalls.find((c) => c.method === 'emergency_pause')
      expect(call).toBeDefined()
      expect(call!.args).toHaveLength(1)
      assertContractCallMatchesSpec(call!, 'project_registry', VAULT_ID, REGISTRY_ID)
    })

    // 4. Verification that type mismatches (e.g. u64 vs u32) are detected
    it('detects type mismatches when u64 is supplied where contract expects u32', () => {
      const fakeCall: RecordedContractCall = {
        contractId: VAULT_ID,
        method: 'fund_project',
        args: [
          sdk.nativeToScVal(1n, { type: 'u64' }), // Invalid: contract expects u32
          sdk.nativeToScVal(10000000n, { type: 'i128' }),
        ],
      }

      expect(() =>
        assertContractCallMatchesSpec(fakeCall, 'investment_vault', VAULT_ID, REGISTRY_ID),
      ).toThrow(
        "Argument type mismatch for method 'fund_project' on InvestmentVault at position 0 ('project_id'): expected 'u32', received 'u64' (scvU64)",
      )
    })
  })
})
