// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk'

// Verifies the on-chain registry read path (#625): a valid simulation source,
// u32 argument encoding with no u64 retry, allowHttp for a local RPC, and the
// configured passphrase override. Only rpc.Server is replaced; the real SDK
// builds and encodes every transaction, so these assertions see exactly the
// InvokeContract call the app would simulate.

const rpcMock = vi.hoisted(() => ({
  simulateTransaction: vi.fn(),
  serverUrls: [] as string[],
  serverOptions: [] as unknown[],
}))

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()
  class Server {
    constructor(url: string, opts?: unknown) {
      rpcMock.serverUrls.push(url)
      rpcMock.serverOptions.push(opts)
    }
    simulateTransaction = rpcMock.simulateTransaction
  }
  return { ...actual, rpc: { ...actual.rpc, Server } }
})

const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 7))

async function loadRegistry(
  env: Record<string, string> = {},
): Promise<typeof import('./registry')> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', CONTRACT_ID)
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return import('./registry')
}

function okSimulation(retval: xdr.ScVal) {
  return { result: { retval }, latestLedger: 1 }
}

/** The InvokeContract call of the most recent simulated transaction. */
function lastInvocation() {
  const calls = rpcMock.simulateTransaction.mock.calls
  const tx = calls[calls.length - 1]?.[0] as {
    source: string
    networkPassphrase: string
    operations: Array<{ type: string; func: xdr.HostFunction }>
  }
  const call = tx.operations[0].func.invokeContract()
  return {
    source: tx.source,
    networkPassphrase: tx.networkPassphrase,
    method: call.functionName().toString(),
    argTypes: call.args().map((a) => a.switch().name),
  }
}

beforeEach(() => {
  rpcMock.simulateTransaction.mockReset()
  rpcMock.serverUrls.length = 0
  rpcMock.serverOptions.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('registry on-chain reads (#625)', () => {
  it('simulates total_projects with the valid default source account', async () => {
    rpcMock.simulateTransaction.mockResolvedValue(okSimulation(nativeToScVal(7, { type: 'u32' })))
    const { fetchTotalProjects, SIMULATION_SOURCE_ADDRESS } = await loadRegistry()

    await expect(fetchTotalProjects()).resolves.toBe(7)
    expect(rpcMock.simulateTransaction).toHaveBeenCalledTimes(1)
    const call = lastInvocation()
    expect(call.source).toBe(SIMULATION_SOURCE_ADDRESS)
    expect(StrKey.isValidEd25519PublicKey(call.source)).toBe(true)
  })

  it('encodes registry ids as u32 without a u64 retry', async () => {
    rpcMock.simulateTransaction.mockResolvedValue(okSimulation(xdr.ScVal.scvVec([])))
    const { fetchScoreHistory } = await loadRegistry()

    await fetchScoreHistory(7)
    expect(rpcMock.simulateTransaction).toHaveBeenCalledTimes(1)
    const call = lastInvocation()
    expect(call.method).toBe('get_score_history')
    expect(call.argTypes).toEqual(['scvU32'])
  })

  it('allows plain http for a local quickstart RPC endpoint', async () => {
    rpcMock.simulateTransaction.mockResolvedValue(okSimulation(nativeToScVal(1, { type: 'u32' })))
    const { fetchTotalProjects } = await loadRegistry({
      NEXT_PUBLIC_SOROBAN_RPC_URL: 'http://localhost:8000/soroban/rpc',
    })

    await fetchTotalProjects()
    expect(rpcMock.serverUrls[0]).toBe('http://localhost:8000/soroban/rpc')
    expect(rpcMock.serverOptions[0]).toEqual({ allowHttp: true })
  })

  it('builds simulations with the configured passphrase override', async () => {
    const passphrase = 'Standalone Network ; February 2017'
    rpcMock.simulateTransaction.mockResolvedValue(okSimulation(nativeToScVal(2, { type: 'u32' })))
    const { fetchTotalProjects } = await loadRegistry({
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: passphrase,
    })

    await fetchTotalProjects()
    expect(lastInvocation().networkPassphrase).toBe(passphrase)
  })

  it('does not retry a failing RPC call (single attempt)', async () => {
    rpcMock.simulateTransaction.mockResolvedValue({ error: 'boom', latestLedger: 1 })
    const { fetchTotalProjects } = await loadRegistry()

    await expect(fetchTotalProjects()).resolves.toBeGreaterThan(0)
    expect(rpcMock.simulateTransaction).toHaveBeenCalledTimes(1)
  })

  it('does not mask an invalid source account behind fixtures', async () => {
    const { fetchTotalProjects } = await loadRegistry()

    await expect(fetchTotalProjects('NOT-A-VALID-ADDRESS')).rejects.toThrow()
    expect(rpcMock.simulateTransaction).not.toHaveBeenCalled()
  })
})
