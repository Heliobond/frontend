// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Keypair, StrKey, nativeToScVal, xdr, Contract, Account } from '@stellar/stellar-sdk'
import vaultSpec from '../test/fixtures/contracts/investment_vault.spec.json'
import registrySpec from '../test/fixtures/contracts/project_registry.spec.json'
import { CONTRACTS_COMMIT_SHA } from '../test/fixtures/contracts/contracts-commit'

interface SpecInput {
  name: string
  type: string | Record<string, unknown>
}

interface SpecFunction {
  name: string
  inputs: SpecInput[]
  outputs: unknown[]
}

function parseContractSpec(specJson: unknown[]): Map<string, SpecFunction> {
  const map = new Map<string, SpecFunction>()
  for (const entry of specJson) {
    if (entry && typeof entry === 'object' && 'function_v0' in entry) {
      const fn = (entry as { function_v0: SpecFunction }).function_v0
      map.set(fn.name, fn)
    }
  }
  return map
}

const vaultFunctions = parseContractSpec(vaultSpec as unknown[])
const registryFunctions = parseContractSpec(registrySpec as unknown[])

function matchesType(scvType: string, specType: unknown): boolean {
  if (typeof specType === 'string') {
    switch (specType) {
      case 'address':
        return scvType === 'scvAddress'
      case 'i128':
        return scvType === 'scvI128'
      case 'u32':
        return scvType === 'scvU32'
      case 'u64':
        return scvType === 'scvU64'
      case 'i64':
        return scvType === 'scvI64'
      case 'bool':
        return scvType === 'scvBool'
      case 'string':
        return scvType === 'scvString'
      case 'bytes':
        return scvType === 'scvBytes'
      case 'symbol':
        return scvType === 'scvSymbol'
      case 'void':
        return scvType === 'scvVoid'
      default:
        return false
    }
  }
  if (specType && typeof specType === 'object') {
    if ('vec' in specType) return scvType === 'scvVec'
    if ('bytes_n' in specType) return scvType === 'scvBytes'
    if ('map' in specType) return scvType === 'scvMap'
    if ('tuple' in specType) return scvType === 'scvVec' || scvType === 'scvMap'
    if ('option' in specType) return true
  }
  return false
}

interface RecordedCall {
  contractId: string
  method: string
  argTypes: string[]
  args: xdr.ScVal[]
}

const recordedCalls: RecordedCall[] = []

function assertCallMatchesSpec(
  call: RecordedCall,
  specFunctions: Map<string, SpecFunction>,
  contractName: string,
) {
  const spec = specFunctions.get(call.method)
  expect(spec, `Method '${call.method}' does not exist in ${contractName} ABI`).toBeDefined()
  if (!spec) return

  expect(
    call.argTypes.length,
    `Method '${call.method}' expected ${spec.inputs.length} arguments in ${contractName} but received ${call.argTypes.length}`,
  ).toBe(spec.inputs.length)

  for (let i = 0; i < spec.inputs.length; i++) {
    const inputSpec = spec.inputs[i]
    const actualType = call.argTypes[i]
    const match = matchesType(actualType, inputSpec.type)
    expect(
      match,
      `Argument '${inputSpec.name}' (index ${i}) of method '${call.method}' expected ${JSON.stringify(inputSpec.type)} but got ${actualType}`,
    ).toBe(true)
  }
}

const VAULT_ID = StrKey.encodeContract(Buffer.alloc(32, 1))
const REGISTRY_ID = StrKey.encodeContract(Buffer.alloc(32, 2))
const USER_ADDR = Keypair.random().publicKey()

describe('Contract ABI fixtures and call-shape verification (#719)', () => {
  let callSpy: ReturnType<typeof vi.spyOn>

  const prevVaultEnv = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
  const prevRegistryEnv = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID

  beforeEach(async () => {
    recordedCalls.length = 0

    process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID = VAULT_ID
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = REGISTRY_ID

    callSpy = vi.spyOn(Contract.prototype, 'call').mockImplementation(function (
      this: Contract,
      method: string,
      ...args: xdr.ScVal[]
    ) {
      recordedCalls.push({
        contractId: this.address().toString(),
        method,
        argTypes: args.map((a) => a.switch().name),
        args,
      })
      // Return a valid dummy operation
      return {
        type: 'invokeHostFunction',
        func: {
          switch: () => 0,
        },
      } as unknown as xdr.Operation
    })

    const { rpc, Horizon } = await import('@stellar/stellar-sdk')
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
      result: { retval: nativeToScVal(100n, { type: 'i128' }) },
    } as unknown as never)
    vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockResolvedValue({
      status: 'PENDING',
      hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    } as unknown as never)
    vi.spyOn(rpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: 'SUCCESS',
    } as unknown as never)

    vi.spyOn(Horizon.Server.prototype, 'loadAccount').mockResolvedValue(
      new Account(USER_ADDR, '100') as unknown as never,
    )
    vi.spyOn(Horizon.Server.prototype, 'fetchBaseFee').mockResolvedValue(100)
  })

  afterEach(() => {
    if (callSpy) callSpy.mockRestore()
    vi.restoreAllMocks()
    if (prevVaultEnv === undefined) delete process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
    else process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID = prevVaultEnv
    if (prevRegistryEnv === undefined) delete process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID
    else process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = prevRegistryEnv
  })

  it('records a non-empty commit SHA for pinned contract specs', () => {
    expect(CONTRACTS_COMMIT_SHA).toBeDefined()
    expect(CONTRACTS_COMMIT_SHA).toMatch(/^[0-9a-f]{40}$/)
    expect(vaultFunctions.size).toBeGreaterThan(0)
    expect(registryFunctions.size).toBeGreaterThan(0)
  })

  describe('InvestmentVault client calls (src/wallet/vault.ts)', () => {
    it('matches claim()', async () => {
      const { submitClaim } = await import('./vault')
      await submitClaim(USER_ADDR, async (xdr) => xdr).catch(() => {})
      const claimCall = recordedCalls.find((c) => c.method === 'claim')
      expect(claimCall).toBeDefined()
      assertCallMatchesSpec(claimCall!, vaultFunctions, 'InvestmentVault')
    })

    it('matches claim_yield(from: address)', async () => {
      const { submitClaimYield } = await import('./vault')
      await submitClaimYield(USER_ADDR, async (xdr) => xdr).catch(() => {})
      const claimYieldCall = recordedCalls.find((c) => c.method === 'claim_yield')
      expect(claimYieldCall).toBeDefined()
      assertCallMatchesSpec(claimYieldCall!, vaultFunctions, 'InvestmentVault')
    })

    it('matches convert_to_assets(shares_amount: i128) in fetchSharePrice', async () => {
      const { fetchSharePrice } = await import('./vault')
      await fetchSharePrice(USER_ADDR).catch(() => {})
      const convertCall = recordedCalls.find((c) => c.method === 'convert_to_assets')
      expect(convertCall).toBeDefined()
      assertCallMatchesSpec(convertCall!, vaultFunctions, 'InvestmentVault')
    })

    it('matches total_assets() in fetchTotalAssets', async () => {
      const { fetchTotalAssets } = await import('./vault')
      await fetchTotalAssets(USER_ADDR).catch(() => {})
      const totalAssetsCall = recordedCalls.find((c) => c.method === 'total_assets')
      expect(totalAssetsCall).toBeDefined()
      assertCallMatchesSpec(totalAssetsCall!, vaultFunctions, 'InvestmentVault')
    })

    // Known ABI drift from #584 where frontend sends (amount, minShares) instead of (from: address, usdc_amount: i128)
    it.fails(
      'vault.ts: submitDeposit sends (amount, minShares) instead of (from: address, usdc_amount: i128) (#584, #719)',
      async () => {
        const { submitDeposit } = await import('./vault')
        await submitDeposit(50, USER_ADDR, async (xdr) => xdr).catch(() => {})
        const depositCall = recordedCalls.find((c) => c.method === 'deposit')
        expect(depositCall).toBeDefined()
        assertCallMatchesSpec(depositCall!, vaultFunctions, 'InvestmentVault')
      },
    )

    // Known ABI drift from #584 where frontend sends (shares, minUsdc) instead of (from: address, shares: i128, minUsdc: i128)
    it.fails(
      'vault.ts: submitWithdraw sends (shares, minUsdc) instead of (from: address, shares: i128, minUsdc: i128) (#584, #719)',
      async () => {
        const { submitWithdraw } = await import('./vault')
        await submitWithdraw(25, USER_ADDR, async (xdr) => xdr).catch(() => {})
        const withdrawCall = recordedCalls.find((c) => c.method === 'withdraw')
        expect(withdrawCall).toBeDefined()
        assertCallMatchesSpec(withdrawCall!, vaultFunctions, 'InvestmentVault')
      },
    )
  })

  describe('ProjectRegistry client calls (src/wallet/registry.ts)', () => {
    it('matches get_projects_page(offset: u32, limit: u32)', async () => {
      const { fetchProjectsPage } = await import('./registry')
      await fetchProjectsPage(0, 10).catch(() => {})
      const pageCall = recordedCalls.find((c) => c.method === 'get_projects_page')
      expect(pageCall).toBeDefined()
      assertCallMatchesSpec(pageCall!, registryFunctions, 'ProjectRegistry')
    })

    it('matches get_project(id: u32)', async () => {
      const { fetchProjectWithDetails } = await import('./registry')
      await fetchProjectWithDetails(1).catch(() => {})
      const projectCall = recordedCalls.find((c) => c.method === 'get_project')
      expect(projectCall).toBeDefined()
      assertCallMatchesSpec(projectCall!, registryFunctions, 'ProjectRegistry')
    })

    it('matches get_score_history(project_id: u32)', async () => {
      const { fetchScoreHistory } = await import('./registry')
      await fetchScoreHistory(1).catch(() => {})
      const scoreCall = recordedCalls.find((c) => c.method === 'get_score_history')
      expect(scoreCall).toBeDefined()
      assertCallMatchesSpec(scoreCall!, registryFunctions, 'ProjectRegistry')
    })

    it('matches total_projects()', async () => {
      const { fetchTotalProjects } = await import('./registry')
      await fetchTotalProjects().catch(() => {})
      const totalProjectsCall = recordedCalls.find((c) => c.method === 'total_projects')
      expect(totalProjectsCall).toBeDefined()
      assertCallMatchesSpec(totalProjectsCall!, registryFunctions, 'ProjectRegistry')
    })

    it('matches get_interest_rate(project_id: u32)', async () => {
      const { defaultSimulateRegistryCall } = await import('./registry')
      await defaultSimulateRegistryCall('get_interest_rate', [1]).catch(() => {})
      const rateCall = recordedCalls.find((c) => c.method === 'get_interest_rate')
      expect(rateCall).toBeDefined()
      assertCallMatchesSpec(rateCall!, registryFunctions, 'ProjectRegistry')
    })

    it('matches is_paused()', async () => {
      const { defaultSimulateRegistryCall } = await import('./registry')
      await defaultSimulateRegistryCall('is_paused').catch(() => {})
      const pauseCall = recordedCalls.find((c) => c.method === 'is_paused')
      expect(pauseCall).toBeDefined()
      assertCallMatchesSpec(pauseCall!, registryFunctions, 'ProjectRegistry')
    })
  })

  describe('Admin client calls (src/wallet/admin.ts)', () => {
    it('matches fund_project(project_id: u32, amount: i128)', async () => {
      const { submitFundProject } = await import('./admin')
      await submitFundProject(1, 100, USER_ADDR, async (xdr) => xdr, false).catch(() => {})
      const fundCall = recordedCalls.find((c) => c.method === 'fund_project')
      expect(fundCall).toBeDefined()
      assertCallMatchesSpec(fundCall!, vaultFunctions, 'InvestmentVault')
    })

    it('matches update_impact_score(project_id: u32, credit_quality: u32, green_impact: u32)', async () => {
      const { submitUpdateScores } = await import('./admin')
      await submitUpdateScores(1, 80, 90, USER_ADDR, async (xdr) => xdr, false).catch(() => {})
      const scoreCall = recordedCalls.find((c) => c.method === 'update_impact_score')
      expect(scoreCall).toBeDefined()
      assertCallMatchesSpec(scoreCall!, registryFunctions, 'ProjectRegistry')
    })

    it('matches set_whitelist(account: address, status: bool)', async () => {
      const { submitSetWhitelist } = await import('./admin')
      await submitSetWhitelist(USER_ADDR, true, USER_ADDR, async (xdr) => xdr, false).catch(
        () => {},
      )
      const whitelistCall = recordedCalls.find((c) => c.method === 'set_whitelist')
      expect(whitelistCall).toBeDefined()
      assertCallMatchesSpec(whitelistCall!, registryFunctions, 'ProjectRegistry')
    })

    // Known upstream issues on main flagged with it.fails linked to #719
    it.fails('admin.ts: isMultisigDeployment calls non-existent is_multisig (#719)', async () => {
      const { isMultisigDeployment } = await import('./admin')
      await isMultisigDeployment(USER_ADDR).catch(() => {})
      const multiCall = recordedCalls.find((c) => c.method === 'is_multisig')
      expect(multiCall).toBeDefined()
      assertCallMatchesSpec(multiCall!, vaultFunctions, 'InvestmentVault')
    })

    it.fails(
      'admin.ts: submitFundProject with multisig calls non-existent fund_project_approved (#719)',
      async () => {
        const { submitFundProject } = await import('./admin')
        await submitFundProject(1, 100, USER_ADDR, async (xdr) => xdr, true).catch(() => {})
        const fundApprovedCall = recordedCalls.find((c) => c.method === 'fund_project_approved')
        expect(fundApprovedCall).toBeDefined()
        assertCallMatchesSpec(fundApprovedCall!, vaultFunctions, 'InvestmentVault')
      },
    )

    it.fails(
      'admin.ts: submitPause passes an unexpected boolean argument to pause() (#719)',
      async () => {
        const { submitPause } = await import('./admin')
        await submitPause(true, USER_ADDR, async (xdr) => xdr, false).catch(() => {})
        const pauseCall = recordedCalls.find((c) => c.method === 'pause')
        expect(pauseCall).toBeDefined()
        assertCallMatchesSpec(pauseCall!, vaultFunctions, 'InvestmentVault')
      },
    )
  })
})
