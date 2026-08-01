/**
 * Stellar network configuration — driven by environment variables so the app
 * can target testnet (default), public (mainnet), or futurenet without code
 * changes.
 *
 * Override via:
 *   NEXT_PUBLIC_STELLAR_NETWORK=public   → Stellar public network (mainnet)
 *   NEXT_PUBLIC_STELLAR_NETWORK=testnet  → Stellar testnet (default)
 *   NEXT_PUBLIC_STELLAR_NETWORK=futurenet→ Stellar futurenet
 *
 * Soroban RPC and Horizon URLs are resolved from the network choice but can
 * also be overridden individually:
 *   NEXT_PUBLIC_SOROBAN_RPC_URL
 *   NEXT_PUBLIC_HORIZON_URL
 */

import { Networks } from '@stellar/stellar-sdk'

export type StellarNetwork = 'public' | 'testnet' | 'futurenet'

const VALID_NETWORKS: StellarNetwork[] = ['public', 'testnet', 'futurenet']

function resolveNetwork(): StellarNetwork {
  const raw = process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase()
  if (raw && VALID_NETWORKS.includes(raw as StellarNetwork)) {
    return raw as StellarNetwork
  }
  return 'testnet'
}

/** The active Stellar network identifier. */
export const STELLAR_NETWORK: StellarNetwork = resolveNetwork()

/** Stellar SDK network passphrase for the active network. */
export function getNetworkPassphrase(): string {
  switch (STELLAR_NETWORK) {
    case 'public':
      return Networks.PUBLIC
    case 'futurenet':
      return Networks.FUTURENET
    case 'testnet':
    default:
      return Networks.TESTNET
  }
}

/** Soroban RPC endpoint for the active network. */
export function getSorobanRpcUrl(): string {
  if (process.env.NEXT_PUBLIC_SOROBAN_RPC_URL) {
    return process.env.NEXT_PUBLIC_SOROBAN_RPC_URL
  }
  switch (STELLAR_NETWORK) {
    case 'public':
      return 'https://soroban.stellar.org'
    case 'futurenet':
      return 'https://rpc-futurenet.stellar.org'
    case 'testnet':
    default:
      return 'https://soroban-testnet.stellar.org'
  }
}

/** Horizon API endpoint for the active network. */
export function getHorizonUrl(): string {
  if (process.env.NEXT_PUBLIC_HORIZON_URL) {
    return process.env.NEXT_PUBLIC_HORIZON_URL
  }
  switch (STELLAR_NETWORK) {
    case 'public':
      return 'https://horizon.stellar.org'
    case 'futurenet':
      return 'https://horizon-futurenet.stellar.org'
    case 'testnet':
    default:
      return 'https://horizon-testnet.stellar.org'
  }
}

/** Human-readable label shown in the network switcher badge. */
export function getNetworkLabel(): string {
  switch (STELLAR_NETWORK) {
    case 'public':
      return 'Mainnet'
    case 'futurenet':
      return 'Futurenet'
    case 'testnet':
    default:
      return 'Testnet'
  }
}

/** WalletKit network identifier (capitalised). */
export function getWalletNetwork(): 'TESTNET' | 'PUBLIC' | 'FUTURENET' {
  switch (STELLAR_NETWORK) {
    case 'public':
      return 'PUBLIC'
    case 'futurenet':
      return 'FUTURENET'
    case 'testnet':
    default:
      return 'TESTNET'
  }
}
