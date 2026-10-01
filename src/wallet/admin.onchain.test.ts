// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk'

const rpcMock = vi.hoisted(() => ({
  simulateTransaction: vi.fn(),
  getTransaction: vi.fn(),
  serverUrls: [] as string[],
  serverOptions: [] as unknown[],
}))

const horizonMock = vi.hoisted(() => ({
  loadAccount: vi.fn(),
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
    getTransaction = rpcMock.getTransaction
  }
  class HorizonServer {
    constructor(url: string, opts?: unknown) {
      horizonMock.serverUrls.push(url)
      horizonMock.serverOptions.push(opts)
    }
    loadAccount = horizonMock.loadAccount
  }
  return {
    ...actual,
    rpc: { ...actual.rpc, Server },
    Horizon: { ...actual.Horizon, Server: HorizonServer },
  }
})

const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 8))
const ADMIN_ADDR = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'

async function loadAdmin(env: Record<string, string> = {}): Promise<typeof import('./admin')> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', CONTRACT_ID)
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return import('./admin')
}

function okSimulation(retval: xdr.ScVal) {
  return { result: { retval }, latestLedger: 1 }
}

function lastRpcInvocation() {
  const calls = rpcMock.simulateTransaction.mock.calls
  const tx = calls[calls.length - 1]?.[0] as {
    source: string
    networkPassphrase: string
    operations: Array<{ type: string; func: xdr.HostFunction }>
  }
  return {
    source: tx.source,
    networkPassphrase: tx.networkPassphrase,
  }
}

beforeEach(() => {
  rpcMock.simulateTransaction.mockReset()
  rpcMock.getTransaction.mockReset()
  rpcMock.serverUrls.length = 0
  rpcMock.serverOptions.length = 0
  horizonMock.loadAccount.mockReset()
  horizonMock.serverUrls.length = 0
  horizonMock.serverOptions.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('admin on-chain network configuration (#720)', () => {
  it('allows plain HTTP for a local quickstart RPC endpoint in checkIsAdmin', async () => {
    rpcMock.simulateTransaction.mockResolvedValue(okSimulation(nativeToScVal(ADMIN_ADDR)))
    const { checkIsAdmin } = await loadAdmin({
      NEXT_PUBLIC_SOROBAN_RPC_URL: 'http://localhost:8000/rpc',
    })

    await checkIsAdmin(ADMIN_ADDR)
    expect(rpcMock.serverUrls[0]).toBe('http://localhost:8000/rpc')
    expect(rpcMock.serverOptions[0]).toEqual({ allowHttp: true })
  })

  it('builds admin simulations with custom NETWORK_PASSPHRASE override', async () => {
    const customPassphrase = 'Standalone Network ; February 2017'
    rpcMock.simulateTransaction.mockResolvedValue(okSimulation(nativeToScVal(ADMIN_ADDR)))
    const { checkIsAdmin } = await loadAdmin({
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: customPassphrase,
    })

    await checkIsAdmin(ADMIN_ADDR)
    expect(lastRpcInvocation().networkPassphrase).toBe(customPassphrase)
  })

  it('allows plain HTTP in isMultisigDeployment', async () => {
    rpcMock.simulateTransaction.mockResolvedValue(okSimulation(nativeToScVal(false)))
    const { isMultisigDeployment } = await loadAdmin({
      NEXT_PUBLIC_SOROBAN_RPC_URL: 'http://127.0.0.1:8000/rpc',
    })

    await isMultisigDeployment(ADMIN_ADDR)
    expect(rpcMock.serverUrls[0]).toBe('http://127.0.0.1:8000/rpc')
    expect(rpcMock.serverOptions[0]).toEqual({ allowHttp: true })
  })
})
