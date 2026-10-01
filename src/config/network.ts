/**
 * Centralized Stellar network configuration.
 * Single source of truth for network, RPC, Horizon, passphrase, and explorer URLs.
 * Validates network configuration at initialization time and defaults to testnet.
 */

export type StellarNetworkName = 'testnet' | 'public'
export type StellarNetworkUpper = 'TESTNET' | 'PUBLIC'

const PASSPHRASES: Record<StellarNetworkName, string> = {
  testnet: 'Test SDF Network ; September 2015',
  public: 'Public Global Stellar Network ; September 2015',
}

const DEFAULT_HORIZON_URLS: Record<StellarNetworkName, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  public: 'https://horizon.stellar.org',
}

const DEFAULT_RPC_URLS: Record<StellarNetworkName, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  public: 'https://soroban.stellar.org',
}

const DEFAULT_EXPLORER_URLS: Record<StellarNetworkName, string> = {
  testnet: 'https://stellar.expert/explorer/testnet',
  public: 'https://stellar.expert/explorer/public',
}

export function validateNetwork(rawNetwork?: string): StellarNetworkName {
  if (!rawNetwork) return 'testnet'
  const normalized = rawNetwork.trim().toLowerCase()
  if (normalized === 'testnet' || normalized === 'public') {
    return normalized
  }
  throw new Error(`Unknown Stellar network: "${rawNetwork}". Expected "testnet" or "public".`)
}

export const STELLAR_NETWORK: StellarNetworkName = validateNetwork(
  process.env.NEXT_PUBLIC_STELLAR_NETWORK,
)

export const STELLAR_NETWORK_UPPERCASE: StellarNetworkUpper =
  STELLAR_NETWORK === 'public' ? 'PUBLIC' : 'TESTNET'

/**
 * Passphrase transactions are built and signed with. Defaults to the selected
 * network's; NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE overrides it so e2e runs can
 * target a local stellar/quickstart ("Standalone Network ; February 2017").
 */
export const NETWORK_PASSPHRASE: string =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || PASSPHRASES[STELLAR_NETWORK]

const KNOWN_PASSPHRASES: Record<string, string> = {
  [PASSPHRASES.public]: 'Mainnet',
  [PASSPHRASES.testnet]: 'Testnet',
  'Test SDF Future Network ; October 2022': 'Futurenet',
  'Standalone Network ; February 2017': 'Standalone',
}

/** Human-readable name for a network passphrase ("Mainnet", "Testnet", …). */
export function networkLabel(passphrase: string): string {
  return KNOWN_PASSPHRASES[passphrase] ?? 'an unknown network'
}

/**
 * Passphrase to sign with for a network. The build's own network returns
 * NETWORK_PASSPHRASE so a local override is honoured.
 */
export function passphraseForNetwork(network: StellarNetworkUpper): string {
  if (network === STELLAR_NETWORK_UPPERCASE) return NETWORK_PASSPHRASE
  return PASSPHRASES[network === 'PUBLIC' ? 'public' : 'testnet']
}

/** True when the app builds mainnet transactions. */
export const isMainnet: boolean = NETWORK_PASSPHRASE === PASSPHRASES.public

/** Plain-HTTP endpoints are only legitimate for a local node (e2e, quickstart). */
export function allowHttpFor(url: string): boolean {
  return url.startsWith('http://')
}

export const HORIZON_URL: string =
  process.env.NEXT_PUBLIC_HORIZON_URL || DEFAULT_HORIZON_URLS[STELLAR_NETWORK]

export const SOROBAN_RPC_URL: string =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || DEFAULT_RPC_URLS[STELLAR_NETWORK]

export const RPC_URL: string = SOROBAN_RPC_URL

export const EXPLORER_BASE_URL: string = DEFAULT_EXPLORER_URLS[STELLAR_NETWORK]

export const isTestnet: boolean = STELLAR_NETWORK === 'testnet'
export const isPublic: boolean = STELLAR_NETWORK === 'public'

export function getExplorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE_URL}/tx/${hash}`
}

export function getExplorerAccountUrl(address: string): string {
  return `${EXPLORER_BASE_URL}/account/${address}`
}

export function getExplorerUrl(value: string): string | undefined {
  if (!value) return undefined
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return getExplorerTxUrl(value)
  }
  if (/^[GCM][A-Z0-9]{55}$/.test(value)) {
    return getExplorerAccountUrl(value)
  }
  return undefined
}
