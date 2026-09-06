// Heliobond — fake ADMIN / ORACLE data for the internal console click-through.
// Not production: these stand in for privileged reads from the InvestmentVault
// (vault accounting) + ProjectRegistry (registry + creator whitelist) Soroban
// contracts. No Math.random — fixed figures so the console renders identically
// across reloads. Reuses the project registry (via selectProjects) for the table.

import { type Project } from '@/data'
import { selectPoolSummary, selectProjects } from '@/state/selectors'

/** Vault accounting, ERC-4626-style. `totalAssets = liquid + deployed`. */
export interface VaultStats {
  /** USDC value of all assets the vault controls. */
  totalAssets: number
  /** total assets ÷ HBS supply. */
  sharePrice: number
  /** HBS shares outstanding. */
  hbsSupply: number
  /** USDC sitting idle in the vault, available to deploy or honour withdrawals. */
  liquid: number
  /** USDC currently working in funded projects. */
  deployed: number
  /** count of projects with capital deployed. */
  projectsFunded: number
}

/** Registry row = a Project plus the oracle's last-verified timestamp. */
export interface RegistryEntry extends Project {
  /** Human-readable "last verified" stamp for the score pair. */
  lastVerified: string
}

// Derive the vault snapshot via the flat selector layer, then extend with the
// admin-only figures the consumer surface never shows (supply + deployed).
const HBS_SUPPLY = 4_834_120.118
const POOL = selectPoolSummary()

export const VAULT_STATS: VaultStats = {
  totalAssets: POOL.totalAssets,
  sharePrice: POOL.sharePrice,
  hbsSupply: HBS_SUPPLY,
  liquid: POOL.liquid,
  deployed: POOL.deployed,
  projectsFunded: POOL.projectsFunded,
}

export type WhitelistStatus = 'approved' | 'pending' | 'rejected'

/** A creator the ProjectRegistry may (or may not yet) accept new projects from. */
export interface Creator {
  name: string
  /** Stellar G-address. */
  address: string
  status: WhitelistStatus
  /** Projects this creator has live in the registry. */
  projects: number
  /** Reason for rejection, only present when status is 'rejected'. */
  rejectionReason?: string
}

// Last-verified stamps, paired to the registry projects in order. Fixed strings.
const VERIFIED_AT: string[] = [
  '2 days ago',
  '6 days ago',
  '11 days ago',
  '3 days ago',
  '18 days ago',
  '5 days ago',
]

export const REGISTRY: RegistryEntry[] = selectProjects().map((p, i) => ({
  ...p,
  lastVerified: VERIFIED_AT[i] ?? 'over a month ago',
}))

export const WHITELIST: Creator[] = [
  { name: 'Sahel Solar Cooperative', address: 'GA7QY...solar', projects: 2, status: 'approved' },
  { name: 'Atlántico Marine Energy', address: 'GBVIG...tidal', projects: 1, status: 'approved' },
  { name: 'Andes Agrivoltaic Trust', address: 'GCATA...agriv', projects: 1, status: 'approved' },
  { name: 'Norrland Wind Collective', address: 'GDJAM...windc', projects: 1, status: 'pending' },
  {
    name: 'Western Ghats Micro-Hydro',
    address: 'GKERA...hydro',
    projects: 0,
    status: 'rejected',
    rejectionReason: 'Missing required permits and environmental impact assessment documentation.',
  },
]

// Re-export the Project type so admin screens can import it from one place.
export type { Project } from '@/data'
