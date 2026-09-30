// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair, StrKey, Transaction, nativeToScVal, xdr } from '@stellar/stellar-sdk'
import { createHash } from 'node:crypto'

// Soroban decoding tests for src/wallet/registry.ts (#626). The real SDK builds
// the read transaction; only `rpc.Server.simulateTransaction` is replaced with a
// contract-shaped ScVal fixture, so these assertions see exactly the values
// `get_projects_page`, `get_project` and `get_score_history` return on-chain.

const rpcMock = vi.hoisted(() => ({
  simulateTransaction: vi.fn(),
}))

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()
  class Server {
    constructor() {}
    simulateTransaction = rpcMock.simulateTransaction
  }
  return { ...actual, rpc: { ...actual.rpc, Server } }
})

const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 7))
const SOURCE = Keypair.random().publicKey()

type Registry = typeof import('./registry')

async function loadRegistry(contractId: string | null = CONTRACT_ID): Promise<Registry> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', contractId ?? '')
  const registry = await import('./registry')
  registry.clearRegistryCache()
  return registry
}

const u32 = (n: number) => nativeToScVal(n, { type: 'u32' })
const u64 = (n: number) => nativeToScVal(BigInt(n), { type: 'u64' })

/** ProjectData struct per contracts/project_registry/src/types.rs. */
function projectData(fields: {
  owner: string
  uri: string
  credit_quality: number
  green_impact: number
  status: number
  metadata_hash: string | Uint8Array
}): xdr.ScVal {
  const hashBytes =
    typeof fields.metadata_hash === 'string'
      ? Buffer.from(fields.metadata_hash, 'utf8')
      : Buffer.from(fields.metadata_hash)
  const entries: Array<[string, xdr.ScVal]> = [
    ['owner', nativeToScVal(fields.owner, { type: 'string' })],
    ['uri', nativeToScVal(fields.uri, { type: 'string' })],
    ['credit_quality', u32(fields.credit_quality)],
    ['green_impact', u32(fields.green_impact)],
    ['maturity_date', u64(0)],
    ['certification_status', u32(0)],
    ['last_update_timestamp', u64(1_700_000_000)],
    ['status', u32(fields.status)],
    ['created_at', u64(1_600_000_000)],
    ['metadata_hash', nativeToScVal(hashBytes, { type: 'bytes' })],
  ]
  return xdr.ScVal.scvMap(
    entries.map(([key, val]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val })),
  )
}

/** A `(u32, ProjectData)` tuple from get_projects_page. */
function projectTuple(id: number, data: xdr.ScVal): xdr.ScVal {
  return xdr.ScVal.scvVec([u32(id), data])
}

/** A ScoreHistoryEntry struct from get_score_history. */
function scoreEntry(timestamp: number, credit: number, green: number): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('timestamp'), val: u64(timestamp) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('credit_quality'), val: u32(credit) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('green_impact'), val: u32(green) }),
  ])
}

function okSimulation(retval: xdr.ScVal) {
  return { result: { retval }, transactionData: {}, minResourceFee: '0', latestLedger: 1 }
}

function mockContract(handlers: Record<string, () => xdr.ScVal>) {
  rpcMock.simulateTransaction.mockImplementation((tx: Transaction) => {
    const op = tx.operations[0] as {
      func: { invokeContract(): { functionName(): { toString(): string } } }
    }
    const call = op.func.invokeContract()
    const method = call.functionName().toString()
    const handler = handlers[method]
    return Promise.resolve(okSimulation(handler ? handler() : xdr.ScVal.scvVoid()))
  })
}

beforeEach(() => {
  rpcMock.simulateTransaction.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('registry client', () => {
  it('maps on-chain project data to UI Project format', async () => {
    const registry = await loadRegistry()
    const raw = {
      owner: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
      uri: 'https://metadata.example/101.json',
      credit_quality: 92n,
      green_impact: 95,
      maturity_date: 1_800_000_000,
      certification_status: 0,
      last_update_timestamp: 1_700_000_000,
      status: 1,
      created_at: 1_600_000_000,
      metadata_hash: 'abc',
    }

    const metadata = {
      name: 'Sahara Agrivoltaic Test',
      location: 'Ouarzazate, Morocco',
      type: 'Solar' as const,
      fundingGoal: 1000000,
    }

    const mapped = registry.mapOnChainProject(raw, 101, metadata)
    expect(mapped.id).toBe(101)
    expect(Number.isNaN(mapped.id)).toBe(false)
    expect(mapped.name).toBe('Sahara Agrivoltaic Test')
    expect(mapped.credit).toBe(92)
    expect(mapped.green).toBe(95)
    expect(mapped.status).toBe('open')
    expect(mapped.location).toBe('Ouarzazate, Morocco')
    expect(mapped.type).toBe('Solar')
  })

  it('maps every ProjectStatus number to a valid UI status', async () => {
    const { mapProjectStatus } = await loadRegistry()
    expect(mapProjectStatus(0)).toBe('upcoming') // Pending
    expect(mapProjectStatus(1)).toBe('open') // Active
    expect(mapProjectStatus(2)).toBe('funded') // Funded
    expect(mapProjectStatus(3)).toBe('funded') // Completed
    expect(mapProjectStatus(4)).toBe('funded') // Archived
    expect(mapProjectStatus(undefined)).toBeUndefined()
  })

  it('unwraps (u32, ProjectData) tuples from get_projects_page', async () => {
    const registry = await loadRegistry()
    mockContract({
      get_projects_page: () =>
        xdr.ScVal.scvVec([
          projectTuple(
            42,
            projectData({
              owner: 'GOWNERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              uri: 'https://metadata.example/42.json',
              credit_quality: 66,
              green_impact: 77,
              status: 1,
              metadata_hash: '',
            }),
          ),
          projectTuple(
            7,
            projectData({
              owner: 'GOWNERBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
              uri: 'https://metadata.example/7.json',
              credit_quality: 71,
              green_impact: 82,
              status: 2,
              metadata_hash: '',
            }),
          ),
        ]),
      total_projects: () => u32(2),
    })

    const page = await registry.fetchProjectsPage(0, 10, SOURCE)
    expect(page.total).toBe(2)
    expect(page.projects.map((p) => p.id)).toEqual([42, 7])
    expect(page.projects.every((p) => Number.isInteger(p.id) && !Number.isNaN(p.id))).toBe(true)
    expect(page.projects[0].credit).toBe(66)
    expect(page.projects[0].green).toBe(77)
    expect(page.projects[0].status).toBe('open')
    expect(page.projects[1].credit).toBe(71)
    expect(page.projects[1].green).toBe(82)
    expect(page.projects[1].status).toBe('funded')
  })

  it('decodes get_project and fetches off-chain metadata from uri', async () => {
    const registry = await loadRegistry()
    const metadataUrl = 'https://metadata.example/1.json'
    const metadataJson = JSON.stringify({
      name: 'Sokoto Metro Solar',
      location: 'Sokoto, Nigeria',
      type: 'Solar',
      story: 'A community array.',
    })
    const metadataHash = createHash('sha256').update(metadataJson).digest()

    const fetchMock = vi.fn(async (url: string) => {
      if (url === metadataUrl) {
        const bytes = new TextEncoder().encode(metadataJson)
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer }
      }
      return { ok: false, text: async () => '' }
    })
    vi.stubGlobal('fetch', fetchMock)

    mockContract({
      get_project: () =>
        projectData({
          owner: 'GOWNERCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
          uri: metadataUrl,
          credit_quality: 80,
          green_impact: 90,
          status: 1,
          metadata_hash: metadataHash,
        }),
      get_score_history: () => xdr.ScVal.scvVec([scoreEntry(1_704_110_400, 80, 90)]),
    })

    const detail = await registry.fetchProjectWithDetails(1, SOURCE)
    expect(fetchMock).toHaveBeenCalledWith(metadataUrl)
    expect(detail?.verifiedMetadata).toBe('verified')
    expect(detail?.project.id).toBe(1)
    expect(detail?.project.name).toBe('Sokoto Metro Solar')
    expect(detail?.project.credit).toBe(80)
    expect(detail?.project.green).toBe(90)
    expect(detail?.project.status).toBe('open')
  })

  it('decodes ScoreHistoryEntry timestamps and score fields', async () => {
    const registry = await loadRegistry()
    mockContract({
      get_score_history: () =>
        xdr.ScVal.scvVec([
          scoreEntry(1_704_110_400, 74, 84), // 2024-01-01 12:00 UTC
          scoreEntry(1_706_792_400, 76, 86), // 2024-02-01 12:00 UTC
        ]),
    })

    const scores = await registry.fetchScoreHistory(1, SOURCE)
    expect(scores.credit.map((p) => p.value)).toEqual([74, 76])
    expect(scores.green.map((p) => p.value)).toEqual([84, 86])
    expect(scores.credit.every((p) => Number.isFinite(p.value))).toBe(true)
    expect(scores.credit.map((p) => p.date)).toEqual(['Jan 2024', 'Feb 2024'])
    expect(scores.credit.every((p) => !p.date.includes('mo ago'))).toBe(true)
  })

  it('falls back gracefully to fixtures when registry contract is unset', async () => {
    const registry = await loadRegistry(null)
    expect(registry.isRegistryConfigured()).toBe(false)

    const total = await registry.fetchTotalProjects()
    expect(total).toBeGreaterThan(0)

    const page = await registry.fetchProjectsPage(0, 3)
    expect(page.projects).toHaveLength(3)
    expect(page.total).toBe(total)

    const detail = await registry.fetchProjectWithDetails(1)
    expect(detail).not.toBeNull()
    expect(detail?.project.id).toBe(1)
    expect(detail?.verifiedMetadata).toBe('unverified')

    const scores = await registry.fetchScoreHistory(1)
    expect(scores.credit.length).toBeGreaterThan(0)
    expect(scores.green.length).toBeGreaterThan(0)
  })
})
