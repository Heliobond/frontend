// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Account,
  Keypair,
  StrKey,
  nativeToScVal,
  type Transaction,
  type xdr,
} from '@stellar/stellar-sdk'
import { allowHttpFor } from '../config/network'

// Verifies that src/wallet/admin.ts correctly supports local stellar/quickstart (#720):
// - allowHttp enabled for plain-HTTP RPC and Horizon endpoints
// - custom NETWORK_PASSPHRASE honored when building transactions

const rpcMock = vi.hoisted(() => ({
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
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
    sendTransaction = rpcMock.sendTransaction
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

const VAULT_ID = StrKey.encodeContract(Buffer.alloc(32, 1))
const REGISTRY_ID = StrKey.encodeContract(Buffer.alloc(32, 2))
const TEST_ADDRESS = Keypair.random().publicKey()

async function loadAdmin(env: Record<string, string> = {}): Promise<typeof import('./admin')> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', VAULT_ID)
  vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', REGISTRY_ID)
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return import('./admin')
}

function okSimulation(retval: xdr.ScVal) {
  return { result: { retval }, latestLedger: 1 }
}

beforeEach(() => {
  rpcMock.simulateTransaction.mockReset()
  rpcMock.sendTransaction.mockReset()
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

describe('admin on-chain client local network support (#720)', () => {
  it('allows plain HTTP for a local quickstart RPC endpoint in getAdminRoles', async () => {
    rpcMock.simulateTransaction.mockResolvedValue(
      okSimulation(nativeToScVal(TEST_ADDRESS, { type: 'address' })),
    )
    const { getAdminRoles } = await loadAdmin({
      NEXT_PUBLIC_SOROBAN_RPC_URL: 'http://localhost:8000/rpc',
    })

    await getAdminRoles(TEST_ADDRESS)

    expect(rpcMock.serverUrls[0]).toBe('http://localhost:8000/rpc')
    expect(rpcMock.serverOptions[0]).toEqual({ allowHttp: true })
  })

  it('builds transactions with the configured network passphrase override', async () => {
    const customPassphrase = 'Standalone Network ; February 2017'
    rpcMock.simulateTransaction.mockResolvedValue(
      okSimulation(nativeToScVal(TEST_ADDRESS, { type: 'address' })),
    )
    const { getAdminRoles } = await loadAdmin({
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: customPassphrase,
    })

    await getAdminRoles(TEST_ADDRESS)

    expect(rpcMock.simulateTransaction).toHaveBeenCalled()
    const calls = rpcMock.simulateTransaction.mock.calls
    const tx = calls[0]?.[0] as Transaction
    expect(tx.networkPassphrase).toBe(customPassphrase)
  })

  it('allows plain HTTP for local Horizon endpoint in getHorizonServer', async () => {
    const { getHorizonServer } = await import('../config/network')
    const horizon = await getHorizonServer('http://localhost:8000')

    expect(horizonMock.serverUrls).toContain('http://localhost:8000')
    expect(horizonMock.serverOptions).toContainEqual({ allowHttp: true })
    expect(horizon).toBeDefined()
  })

  it('uses allowHttp and networkPassphrase for isMultisigDeployment', async () => {
    const customPassphrase = 'Standalone Network ; February 2017'
    rpcMock.simulateTransaction.mockResolvedValue(okSimulation(nativeToScVal(false)))
    const { isMultisigDeployment } = await loadAdmin({
      NEXT_PUBLIC_SOROBAN_RPC_URL: 'http://localhost:8000/rpc',
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: customPassphrase,
    })

    await isMultisigDeployment(TEST_ADDRESS)

    expect(rpcMock.serverUrls).toContain('http://localhost:8000/rpc')
    expect(rpcMock.serverOptions).toContainEqual({ allowHttp: true })
    const calls = rpcMock.simulateTransaction.mock.calls
    const tx = calls[calls.length - 1]?.[0] as Transaction
    expect(tx.networkPassphrase).toBe(customPassphrase)
  })

  it('uses local HTTP servers and the configured passphrase for admin writes', async () => {
    const customPassphrase = 'Standalone Network ; February 2017'
    const rpcUrl = 'http://localhost:8000/rpc'
    const horizonUrl = 'http://localhost:8000'
    horizonMock.loadAccount.mockResolvedValue(new Account(TEST_ADDRESS, '0'))
    rpcMock.simulateTransaction.mockResolvedValue({ error: 'stop after inspecting transaction' })
    const { submitSetPaused } = await loadAdmin({
      NEXT_PUBLIC_SOROBAN_RPC_URL: rpcUrl,
      NEXT_PUBLIC_HORIZON_URL: horizonUrl,
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: customPassphrase,
    })

    await expect(submitSetPaused('vault', true, TEST_ADDRESS, vi.fn())).rejects.toThrow(
      'Simulation failed: stop after inspecting transaction',
    )

    expect(rpcMock.serverUrls).toContain(rpcUrl)
    expect(rpcMock.serverOptions).toContainEqual({ allowHttp: true })
    expect(horizonMock.serverUrls).toContain(horizonUrl)
    expect(horizonMock.serverOptions).toContainEqual({ allowHttp: true })
    const tx = rpcMock.simulateTransaction.mock.calls[0]?.[0] as Transaction
    expect(tx.networkPassphrase).toBe(customPassphrase)
  })

  it('disables plain HTTP for default HTTPS endpoints', async () => {
    rpcMock.simulateTransaction.mockResolvedValue(
      okSimulation(nativeToScVal(TEST_ADDRESS, { type: 'address' })),
    )
    const { getAdminRoles } = await loadAdmin()

    await getAdminRoles(TEST_ADDRESS)

    expect(rpcMock.serverOptions[0]).toEqual({
      allowHttp: allowHttpFor('https://soroban-testnet.stellar.org'),
    })
  })
})

// Circuit breakers (#695): reads of is_paused / get_emergency_admin and the demo fallback.
describe('pause state reads and writes (#695)', () => {
  const methodOf = (tx: Transaction) =>
    (tx.operations[0] as unknown as { func: xdr.HostFunction }).func
      .invokeContract()
      .functionName()
      .toString()

  it('reads is_paused and the emergency admin from the vault', async () => {
    rpcMock.simulateTransaction.mockImplementation(async (tx: Transaction) => {
      if (methodOf(tx) === 'is_paused') return okSimulation(nativeToScVal(true))
      return okSimulation(nativeToScVal(TEST_ADDRESS, { type: 'address' }))
    })
    const { getPauseState } = await loadAdmin()

    await expect(getPauseState('vault', TEST_ADDRESS)).resolves.toEqual({
      paused: true,
      emergencyAdmin: TEST_ADDRESS,
    })
  })

  it('reports no emergency admin when get_emergency_admin returns None', async () => {
    rpcMock.simulateTransaction.mockImplementation(async (tx: Transaction) => {
      if (methodOf(tx) === 'is_paused') return okSimulation(nativeToScVal(false))
      return okSimulation(nativeToScVal(null))
    })
    const { getPauseState } = await loadAdmin()

    await expect(getPauseState('registry', TEST_ADDRESS)).resolves.toEqual({
      paused: false,
      emergencyAdmin: null,
    })
  })

  it('returns unknown state when the simulation fails', async () => {
    rpcMock.simulateTransaction.mockRejectedValue(new Error('RPC down'))
    const { getPauseState } = await loadAdmin()

    await expect(getPauseState('vault', TEST_ADDRESS)).resolves.toEqual({
      paused: null,
      emergencyAdmin: null,
    })
  })

  it('returns unknown state without calling RPC when the contract is not configured', async () => {
    const { getPauseState } = await loadAdmin({ NEXT_PUBLIC_REGISTRY_CONTRACT_ID: '' })

    await expect(getPauseState('registry', TEST_ADDRESS)).resolves.toEqual({
      paused: null,
      emergencyAdmin: null,
    })
    expect(rpcMock.simulateTransaction).not.toHaveBeenCalled()
  })

  it('simulates a demo pause when no vault is configured', async () => {
    vi.useFakeTimers()
    try {
      const { submitSetPaused } = await loadAdmin({ NEXT_PUBLIC_VAULT_CONTRACT_ID: '' })
      const pending = submitSetPaused('vault', true, TEST_ADDRESS, vi.fn())
      await vi.advanceTimersByTimeAsync(1500)

      await expect(pending).resolves.toEqual({ hash: expect.stringMatching(/^demo/) })
      expect(rpcMock.sendTransaction).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
