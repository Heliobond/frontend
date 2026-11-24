import { describe, it, expect, vi } from '@/test/bun'
import {
  validateNetwork,
  getExplorerTxUrl,
  getExplorerAccountUrl,
  getExplorerUrl,
  STELLAR_NETWORK,
  HORIZON_URL,
  SOROBAN_RPC_URL,
  NETWORK_PASSPHRASE,
  networkLabel,
  isMainnet,
  allowHttpFor,
  sorobanServerOptions,
  getSorobanServer,
  getHorizonServer,
} from './network'

describe('network configuration', () => {
  it('defaults to testnet when undefined or empty', () => {
    expect(validateNetwork(undefined)).toBe('testnet')
    expect(validateNetwork('')).toBe('testnet')
  })

  it('accepts valid network names case-insensitively', () => {
    expect(validateNetwork('testnet')).toBe('testnet')
    expect(validateNetwork('TESTNET')).toBe('testnet')
    expect(validateNetwork('public')).toBe('public')
    expect(validateNetwork('PUBLIC')).toBe('public')
  })

  it('throws a descriptive error on unknown network value', () => {
    expect(() => validateNetwork('mainnet')).toThrow(
      'Unknown Stellar network: "mainnet". Expected "testnet" or "public".',
    )
    expect(() => validateNetwork('localnet')).toThrow(
      'Unknown Stellar network: "localnet". Expected "testnet" or "public".',
    )
  })

  it('provides active network and non-empty URLs', () => {
    expect(['testnet', 'public']).toContain(STELLAR_NETWORK)
    expect(HORIZON_URL).toContain('stellar.org')
    expect(SOROBAN_RPC_URL).toContain('stellar.org')
  })

  it('generates correct explorer URLs', () => {
    const tx = 'a'.repeat(64)
    const addr = 'G' + 'A'.repeat(55)
    expect(getExplorerTxUrl(tx)).toContain(`/tx/${tx}`)
    expect(getExplorerAccountUrl(addr)).toContain(`/account/${addr}`)
    expect(getExplorerUrl(tx)).toContain(`/tx/${tx}`)
    expect(getExplorerUrl(addr)).toContain(`/account/${addr}`)
    expect(getExplorerUrl('short-val')).toBeUndefined()
  })
})

describe('explorers use the configured Stellar passphrase (#1066)', () => {
  it.each([
    ['public', '', 'https://stellar.expert/explorer/public'],
    ['testnet', '', 'https://stellar.expert/explorer/testnet'],
    ['testnet', 'Standalone Network ; February 2017', undefined],
  ])('uses %s %j to select %s', async (label, passphrase, base) => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', label)
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE', passphrase)
    vi.resetModules()
    const network = await import('./network')
    const hash = 'f'.repeat(64)
    const address = 'G' + 'A'.repeat(55)

    expect(network.getExplorerTxUrl(hash)).toBe(base && `${base}/tx/${hash}`)
    expect(network.getExplorerAccountUrl(address)).toBe(base && `${base}/account/${address}`)
    expect(network.getExplorerUrl(hash)).toBe(base && `${base}/tx/${hash}`)
    expect(network.getExplorerTxUrl(hash, 'testnet')).toBe(
      base && `https://stellar.expert/explorer/testnet/tx/${hash}`,
    )
  })
})

describe('network labels and passphrases (#611)', () => {
  it('names the well-known passphrases', () => {
    expect(networkLabel('Public Global Stellar Network ; September 2015')).toBe('Mainnet')
    expect(networkLabel('Test SDF Network ; September 2015')).toBe('Testnet')
    expect(networkLabel('Standalone Network ; February 2017')).toBe('Standalone')
    expect(networkLabel('something else')).toBe('an unknown network')
  })

  it('builds testnet transactions by default', () => {
    expect(NETWORK_PASSPHRASE).toBe('Test SDF Network ; September 2015')
    expect(isMainnet).toBe(false)
  })

  it('only allows plain HTTP for http:// URLs', () => {
    expect(allowHttpFor('http://localhost:8000/rpc')).toBe(true)
    expect(allowHttpFor('https://soroban-testnet.stellar.org')).toBe(false)
  })

  it('sorobanServerOptions derives allowHttp correctly', () => {
    expect(sorobanServerOptions('http://localhost:8000/rpc')).toEqual({ allowHttp: true })
    expect(sorobanServerOptions('https://soroban-testnet.stellar.org')).toEqual({
      allowHttp: false,
    })
  })

  it('creates Soroban and Horizon server instances with correct options (#720)', async () => {
    const rpcServer = await getSorobanServer('http://localhost:8000/rpc')
    expect(rpcServer).toBeDefined()
    expect(rpcServer.serverURL.toString()).toContain('http://localhost:8000/rpc')

    const horizonServer = await getHorizonServer('http://localhost:8000')
    expect(horizonServer).toBeDefined()
    expect(horizonServer.serverURL.toString()).toContain('http://localhost:8000')
  })
})
