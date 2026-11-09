/**
 * ProjectRegistry client for reading on-chain projects and details.
 * Interacts with deployed Soroban ProjectRegistry contract when NEXT_PUBLIC_REGISTRY_CONTRACT_ID is configured.
 * Implements short-window caching, off-chain metadata resolution, and hash verification.
 * Gracefully falls back to bundled fixtures in demo mode.
 */

import { Address, nativeToScVal, type xdr } from '@stellar/stellar-sdk'
import { AppError } from '../lib/appError'
import { parseContractError } from '../lib/contractErrors'
import { type Project, type ProjectType } from '../data'
import { getLocaleCode } from '../lib/format'
import { type ProjectDetail, type ScorePoint } from '../data/projectDetails'
import {
  selectProjects,
  selectProjectById,
  selectProjectDetail,
  selectScoreHistory,
} from '../state/selectors'
import {
  SOROBAN_RPC_URL as RPC_URL,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  getSorobanServer,
  getHorizonServer,
  isMainnet,
} from '../config/network'
import { reportError } from '../lib/errorReporting'

function getRegistryContractId(): string | undefined {
  return process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID
}

const CACHE_TTL_MS = 30000

/** Timeout in milliseconds for Soroban simulation calls on ProjectRegistry. */
export const REGISTRY_SIMULATION_TIMEOUT_MS = 5000

/** Timeout in milliseconds for fetching off-chain project metadata. */
export const METADATA_FETCH_TIMEOUT_MS = 5000

/** Maximum allowed body size in bytes for off-chain metadata JSON (100 KB). */
export const MAX_METADATA_SIZE_BYTES = 100 * 1024

/** Default HTTPS gateway used to resolve IPFS URIs. */
export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/'

/** True when the active network configuration represents Stellar Mainnet (public). */
export function isMainnetActive(): boolean {
  const envNet = process.env.NEXT_PUBLIC_STELLAR_NETWORK?.trim().toLowerCase()
  const envPass = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE
  return (
    envNet === 'public' || envPass === 'Public Global Stellar Network ; September 2015' || isMainnet
  )
}

/** Reject if a registry simulation takes longer than timeoutMs. */
export async function withSimulationTimeout<T>(
  promise: Promise<T>,
  timeoutMs = REGISTRY_SIMULATION_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Registry simulation timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Reject if an off-chain metadata fetch takes longer than timeoutMs. */
export async function withFetchTimeout<T>(
  promise: Promise<T>,
  timeoutMs = METADATA_FETCH_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Metadata fetch timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Validates and safely resolves an on-chain metadata URI.
 * Allows ONLY https: and ipfs: (resolved via HTTPS gateway).
 * Returns null for any disallowed scheme (http:, data:, file:, javascript:, etc.).
 */
export function resolveMetadataUri(rawUri: string | null | undefined): string | null {
  if (!rawUri || typeof rawUri !== 'string') return null
  const trimmed = rawUri.trim()
  if (!trimmed) return null

  // IPFS scheme handling (ipfs://<cid>[/path] or ipfs:<cid>[/path])
  if (trimmed.startsWith('ipfs://') || trimmed.startsWith('ipfs:')) {
    const ipfsPath = trimmed
      .replace(/^ipfs:\/\//, '')
      .replace(/^ipfs:/, '')
      .replace(/^\/+/, '')
    if (!ipfsPath || ipfsPath.includes('..')) return null
    const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL || DEFAULT_IPFS_GATEWAY).trim()
    const base = gateway.endsWith('/') ? gateway : `${gateway}/`
    try {
      const parsedGateway = new URL(base)
      if (parsedGateway.protocol !== 'https:') return null
      return `${base}${ipfsPath}`
    } catch {
      return null
    }
  }

  // General URL validation: allow ONLY https:
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'https:') {
      return parsed.href
    }
    return null
  } catch {
    return null
  }
}

/**
 * Well-formed Ed25519 public key used as the source account for read-only
 * registry simulations. Simulations are never submitted, so the account only
 * has to be a valid G-address — it never needs to exist on-chain. Mirrors
 * `DEMO_ADDRESS` in WalletProvider.tsx (#625).
 */
export const SIMULATION_SOURCE_ADDRESS = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const memoryCache = new Map<string, CacheEntry<unknown>>()

function getFromCache<T>(key: string): T | null {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key)
    return null
  }
  return entry.data as T
}

function setInCache<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() })
}

const createdProjectHashes = new Map<number, string>()

export function clearRegistryCache(): void {
  memoryCache.clear()
  createdProjectHashes.clear()
}

/** Check if on-chain ProjectRegistry is configured */
export function isRegistryConfigured(): boolean {
  return Boolean(getRegistryContractId())
}

/** Simulate a read call on the ProjectRegistry contract */
export async function defaultSimulateRegistryCall(
  method: string,
  args: unknown[] = [],
  sourceAddress = SIMULATION_SOURCE_ADDRESS,
): Promise<unknown> {
  const contractId = getRegistryContractId()
  if (!contractId) throw new Error('NEXT_PUBLIC_REGISTRY_CONTRACT_ID not set')

  const { Contract, TransactionBuilder, Account, nativeToScVal, scValToNative } =
    await import('@stellar/stellar-sdk')

  const server = await getSorobanServer(RPC_URL)
  const contract = new Contract(contractId)
  const source = new Account(sourceAddress, '0')
  // Honour NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE (local quickstart) via config.
  const networkPassphrase = NETWORK_PASSPHRASE

  // Registry IDs, offsets and limits are all u32 in the contract ABI (#625).
  const scArgs = args.map((a) => {
    if (a && typeof a === 'object' && typeof (a as { switch?: unknown }).switch === 'function') {
      return a
    }
    if (typeof a === 'number' && Number.isInteger(a) && a >= 0 && a <= 4294967295) {
      return nativeToScVal(a, { type: 'u32' })
    }
    return nativeToScVal(a)
  })

  const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase })
    .addOperation(contract.call(method, ...(scArgs as Parameters<typeof contract.call>[1][])))
    .setTimeout(0)
    .build()

  const simResult = await withSimulationTimeout(
    server.simulateTransaction(tx),
    REGISTRY_SIMULATION_TIMEOUT_MS,
  )
  if ('error' in simResult) {
    throw new AppError('simulationFailed')
  }
  if (!simResult.result?.retval) {
    throw new AppError('simulationFailed')
  }
  return scValToNative(simResult.result.retval as Parameters<typeof scValToNative>[0])
}

/**
 * True for caller/programming mistakes (invalid source address, undecodable
 * args) that must surface instead of being hidden behind demo fixtures (#625).
 */
function isProgrammingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    msg.includes('accountId is invalid') ||
    msg.includes('Invalid address') ||
    msg.includes('invalid address') ||
    msg.includes('Malformed') ||
    msg.includes('malformed') ||
    msg.includes('not a valid')
  )
}

/** Report a failed on-chain registry read before any fixture fallback (#625). */
function reportRegistryReadError(method: string, error: unknown): void {
  reportError(error, { kind: 'transaction', context: { target: 'registry', method } })
}

export type RegistrySimulator = (
  method: string,
  args?: unknown[],
  sourceAddress?: string,
) => Promise<unknown>

let activeSimulateRegistryCall: RegistrySimulator = defaultSimulateRegistryCall

export function setSimulateRegistryCall(fn: RegistrySimulator): void {
  activeSimulateRegistryCall = fn
}

export function resetSimulateRegistryCall(): void {
  activeSimulateRegistryCall = defaultSimulateRegistryCall
}

export async function simulateRegistryCall(
  method: string,
  args: unknown[] = [],
  sourceAddress?: string,
): Promise<unknown> {
  return activeSimulateRegistryCall(method, args, sourceAddress)
}

/** Compute hex SHA-256 hash in browser or Node environments.
 * Returns null if crypto.subtle is unavailable (e.g. non-secure context).
 */
export async function computeSha256(content: ArrayBuffer | Uint8Array): Promise<string | null> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
  if (!subtle) {
    return null
  }
  const data = content instanceof Uint8Array ? content : new Uint8Array(content)
  const hashBuffer = await subtle.digest('SHA-256', data as BufferSource)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase()
}

/**
 * Normalizes an on-chain metadata hash into a 64-character lowercase hex string.
 * Returns null if missing, empty, or not a valid 32-byte representation.
 */
export function normalizeHash(
  rawHash: string | Uint8Array | number[] | undefined | null,
): string | null {
  if (!rawHash) return null
  if (typeof rawHash === 'string') {
    const trimmed = rawHash.trim()
    const clean = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed
    if (/^[0-9a-fA-F]{64}$/.test(clean)) {
      return clean.toLowerCase()
    }
    return null
  }
  if (rawHash instanceof Uint8Array || Array.isArray(rawHash)) {
    const arr = Array.from(rawHash)
    if (arr.length === 32) {
      return arr
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toLowerCase()
    }
    return null
  }
  return null
}

/**
 * `ProjectData` as returned by the ProjectRegistry contract. Note there is no
 * `id` (the id is the key/tuple element) and no display fields such as name or
 * funding amounts — those come from the off-chain `uri` metadata.
 */
export interface OnChainProjectRaw {
  owner: string
  uri: string
  credit_quality: number | bigint
  green_impact: number | bigint
  maturity_date: number | bigint
  certification_status: number | bigint
  last_update_timestamp: number | bigint
  /** `ProjectStatus` enum: Pending=0, Active=1, Funded=2, Completed=3, Archived=4 */
  status: number | bigint
  created_at: number | bigint
  metadata_hash: string | Uint8Array
}

/** A `(u32, ProjectData)` element from `get_projects_page`. */
export type OnChainProjectTuple = [number | bigint, OnChainProjectRaw]

/** A single `ScoreHistoryEntry` from `get_score_history`. */
export interface OnChainScoreHistoryEntryRaw {
  timestamp: number | bigint
  credit_quality: number | bigint
  green_impact: number | bigint
}

export interface OffChainMetadata {
  name?: string
  description?: string
  location?: string
  type?: ProjectType
  story?: string
  heroGradient?: string
  fundingGoal?: number
  priceHistory?: Array<{ date: string; price: number; yield: number }>
}

/**
 * Validates off-chain metadata schema and drops invalid or malformed fields.
 * Returns null if the root payload is not a non-null object.
 */
export function validateOffChainMetadata(data: unknown): OffChainMetadata | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }

  const record = data as Record<string, unknown>
  const result: OffChainMetadata = {}

  if (typeof record.name === 'string' && record.name.trim().length > 0) {
    result.name = record.name.trim()
  }

  if (typeof record.description === 'string' && record.description.trim().length > 0) {
    result.description = record.description.trim()
  }

  if (typeof record.location === 'string' && record.location.trim().length > 0) {
    result.location = record.location.trim()
  }

  if (record.type === 'Solar' || record.type === 'Wind' || record.type === 'Hydro') {
    result.type = record.type
  }

  if (typeof record.story === 'string') {
    result.story = record.story
  }

  if (typeof record.heroGradient === 'string') {
    result.heroGradient = record.heroGradient
  }

  // fundingGoal must be a finite positive number. Strings or non-positive numbers are dropped.
  if (
    typeof record.fundingGoal === 'number' &&
    Number.isFinite(record.fundingGoal) &&
    record.fundingGoal > 0
  ) {
    result.fundingGoal = record.fundingGoal
  }

  // priceHistory must be an Array. Non-array values are dropped.
  if (Array.isArray(record.priceHistory)) {
    const validHistory: Array<{ date: string; price: number; yield: number }> = []
    for (const item of record.priceHistory) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).date === 'string' &&
        typeof (item as Record<string, unknown>).price === 'number' &&
        Number.isFinite((item as Record<string, unknown>).price) &&
        typeof (item as Record<string, unknown>).yield === 'number' &&
        Number.isFinite((item as Record<string, unknown>).yield)
      ) {
        validHistory.push({
          date: (item as { date: string }).date,
          price: (item as { price: number }).price,
          yield: (item as { yield: number }).yield,
        })
      }
    }
    result.priceHistory = validHistory
  }

  return result
}

/** Map the contract's numeric `ProjectStatus` enum to the UI status union. */
export function mapProjectStatus(
  status: number | bigint | string | null | undefined,
): Project['status'] | undefined {
  if (typeof status === 'string') {
    switch (status.toLowerCase()) {
      case 'active':
      case 'open':
        return 'open'
      case 'pending':
      case 'upcoming':
        return 'upcoming'
      case 'funded':
      case 'completed':
      case 'archived':
        return 'funded'
      default:
        return undefined
    }
  }
  switch (Number(status)) {
    case 0:
      return 'upcoming' // Pending
    case 1:
      return 'open' // Active
    case 2:
      return 'funded' // Funded
    case 3:
      return 'funded' // Completed
    case 4:
      return 'funded' // Archived
    default:
      return undefined
  }
}

/** Map on-chain ProjectData plus its id and optional metadata to a UI Project without merging fixtures. */
export function mapOnChainProject(
  raw: OnChainProjectRaw,
  id: number,
  metadata?: OffChainMetadata,
): Project {
  const credit = Number(raw.credit_quality ?? 80)
  const green = Number(raw.green_impact ?? 80)

  const fundingGoal = metadata?.fundingGoal ?? 1000000

  return {
    id,
    name: metadata?.name || `Bond Project #${id}`,
    location: metadata?.location || 'Stellar Network',
    type: metadata?.type || 'Solar',
    credit: Number.isFinite(credit) ? credit : 80,
    green: Number.isFinite(green) ? green : 80,
    funded: '$0',
    fundedAmount: 0,
    fundingGoal,
    status: mapProjectStatus(raw.status) ?? 'open',
    priceHistory: metadata?.priceHistory || [],
  }
}

/** Render a score-history unix timestamp (seconds) as a short date label. */
function formatScoreDate(timestamp: number | bigint | undefined, index: number): string {
  const seconds = Number(timestamp)
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toLocaleDateString(getLocaleCode(), {
      month: 'short',
      year: 'numeric',
    })
  }
  return `${index + 1}mo ago`
}

/** Read total projects count from ProjectRegistry */
export async function fetchTotalProjects(sourceAddress?: string): Promise<number> {
  const cacheKey = 'total_projects'
  const cached = getFromCache<number>(cacheKey)
  if (cached !== null) return cached

  if (!getRegistryContractId()) {
    if (isMainnetActive()) {
      throw new Error('NEXT_PUBLIC_REGISTRY_CONTRACT_ID not set on mainnet')
    }
    return selectProjects().length
  }

  try {
    const retval = await simulateRegistryCall('total_projects', [], sourceAddress)
    const total = Number(retval)
    setInCache(cacheKey, total)
    return total
  } catch (error) {
    reportRegistryReadError('total_projects', error)
    if (isProgrammingError(error) || isMainnetActive()) throw error
    return selectProjects().length
  }
}

export interface ProjectsPageResult {
  projects: Project[]
  total: number
  hasMore: boolean
}

/** Read paginated projects from ProjectRegistry (get_projects_page) */
export async function fetchProjectsPage(
  offset = 0,
  limit = 12,
  sourceAddress?: string,
): Promise<ProjectsPageResult> {
  const cacheKey = `page_${offset}_${limit}`
  const cached = getFromCache<ProjectsPageResult>(cacheKey)
  if (cached !== null) return cached

  if (!getRegistryContractId()) {
    if (isMainnetActive()) {
      throw new Error('NEXT_PUBLIC_REGISTRY_CONTRACT_ID not set on mainnet')
    }
    const all = selectProjects()
    const slice = all.slice(offset, offset + limit)
    const result: ProjectsPageResult = {
      projects: slice,
      total: all.length,
      hasMore: offset + limit < all.length,
    }
    return result
  }

  try {
    const rawList = (await simulateRegistryCall(
      'get_projects_page',
      [offset, limit],
      sourceAddress,
    )) as OnChainProjectTuple[]

    const projects: Project[] = (rawList || []).map((entry) => {
      const [rawId, data] = Array.isArray(entry)
        ? entry
        : [(entry as OnChainProjectRaw & { id?: number | bigint }).id, entry]
      return mapOnChainProject(data as OnChainProjectRaw, Number(rawId))
    })
    const total = await fetchTotalProjects(sourceAddress)
    const result: ProjectsPageResult = {
      projects,
      total,
      hasMore: offset + limit < total,
    }
    setInCache(cacheKey, result)
    return result
  } catch (error) {
    reportRegistryReadError('get_projects_page', error)
    if (isProgrammingError(error) || isMainnetActive()) throw error
    const all = selectProjects()
    const slice = all.slice(offset, offset + limit)
    return {
      projects: slice,
      total: all.length,
      hasMore: offset + limit < all.length,
    }
  }
}

export type MetadataVerificationStatus = 'verified' | 'mismatch' | 'unverified'

export interface ProjectWithVerification {
  project: Project
  detail: ProjectDetail
  verifiedMetadata: MetadataVerificationStatus
}

/** Read single project and verify metadata hash */
export async function fetchProjectWithDetails(
  id: number,
  sourceAddress?: string,
): Promise<ProjectWithVerification | null> {
  const cacheKey = `project_detail_${id}`
  const cached = getFromCache<ProjectWithVerification>(cacheKey)
  if (cached !== null) return cached

  const fallbackProject = selectProjectById(id)
  const fallbackDetail = selectProjectDetail(id)

  if (!getRegistryContractId()) {
    if (isMainnetActive()) {
      throw new Error('NEXT_PUBLIC_REGISTRY_CONTRACT_ID not set on mainnet')
    }
    if (!fallbackProject || !fallbackDetail) return null
    return {
      project: fallbackProject,
      detail: fallbackDetail,
      verifiedMetadata: 'unverified',
    }
  }

  try {
    const raw = (await simulateRegistryCall(
      'get_project',
      [id],
      sourceAddress,
    )) as OnChainProjectRaw | null

    if (!raw) {
      if (isMainnetActive()) return null
      if (!fallbackProject || !fallbackDetail) return null
      return {
        project: fallbackProject,
        detail: fallbackDetail,
        verifiedMetadata: 'unverified',
      }
    }

    let verifiedMetadata: MetadataVerificationStatus = 'unverified'
    let offChainMetadata: OffChainMetadata | undefined

    const resolvedUri = raw.uri ? resolveMetadataUri(raw.uri) : null
    const expected = normalizeHash(raw.metadata_hash)

    if (resolvedUri && expected) {
      try {
        const res = await withFetchTimeout(fetch(resolvedUri), METADATA_FETCH_TIMEOUT_MS)

        if (res.ok) {
          const contentLengthHeader = res.headers?.get?.('content-length')
          const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null
          if (
            contentLength !== null &&
            !isNaN(contentLength) &&
            contentLength > MAX_METADATA_SIZE_BYTES
          ) {
            verifiedMetadata = 'unverified'
          } else {
            const rawBytes = await res.arrayBuffer()
            if (rawBytes.byteLength > MAX_METADATA_SIZE_BYTES) {
              verifiedMetadata = 'unverified'
            } else {
              const computedHash = await computeSha256(rawBytes)
              if (computedHash === null) {
                // crypto.subtle is unavailable (non-secure context) -> unverified
                verifiedMetadata = 'unverified'
              } else if (computedHash.toLowerCase() !== expected.toLowerCase()) {
                // Computed hash differs from on-chain hash -> mismatch
                verifiedMetadata = 'mismatch'
              } else {
                // Hash matched on-chain hash! Parse and validate JSON payload.
                try {
                  const text = new TextDecoder().decode(rawBytes)
                  const parsed = JSON.parse(text)
                  const validated = validateOffChainMetadata(parsed)
                  if (validated) {
                    offChainMetadata = validated
                    verifiedMetadata = 'verified'
                  } else {
                    verifiedMetadata = 'unverified'
                  }
                } catch {
                  // Parse failure on correctly hashed content fails closed to unverified
                  verifiedMetadata = 'unverified'
                }
              }
            }
          }
        } else {
          // HTTP error response from metadata host -> unverified
          verifiedMetadata = 'unverified'
        }
      } catch {
        // Network, timeout, or abort failure -> unverified
        verifiedMetadata = 'unverified'
      }
    } else {
      // Missing or unresolvable URI, or missing expected on-chain hash -> unverified
      verifiedMetadata = 'unverified'
    }

    const project = mapOnChainProject(raw, id, offChainMetadata)

    let scoreHistory: { credit: ScorePoint[]; green: ScorePoint[] } = { credit: [], green: [] }
    try {
      const onChainHistory = await fetchScoreHistory(id, sourceAddress)
      if (onChainHistory.credit.length > 0 || onChainHistory.green.length > 0) {
        scoreHistory = onChainHistory
      }
    } catch {
      /* ignore score history errors on detail view */
    }

    const detail: ProjectDetail = {
      name: project.name,
      location: project.location,
      story: offChainMetadata?.story || 'Project registered on Stellar ProjectRegistry.',
      heroGradient:
        offChainMetadata?.heroGradient ||
        'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(16,185,129,0.2) 100%)',
      creator: {
        name: raw.owner ? `${raw.owner.slice(0, 4)}…${raw.owner.slice(-4)}` : 'Creator',
        verified: true,
        since: '2025',
      },
      scoreHistory: scoreHistory ?? { credit: [], green: [] },
      priceHistory: project.priceHistory.map((p) => ({
        date: p.date,
        price: p.price,
        yield: p.yield,
        hash: `0x${id.toString(16)}0000`,
      })),
      fundingGoal: project.fundingGoal,
      fundedAmount: project.fundedAmount,
      fundingTimeline: [],
    }

    const result: ProjectWithVerification = {
      project,
      detail,
      verifiedMetadata,
    }

    setInCache(cacheKey, result)
    return result
  } catch (error) {
    reportRegistryReadError('get_project', error)
    if (isProgrammingError(error) || isMainnetActive()) throw error
    if (!fallbackProject || !fallbackDetail) return null
    return {
      project: fallbackProject,
      detail: fallbackDetail,
      verifiedMetadata: 'unverified',
    }
  }
}

/** Read score history for sparklines from ProjectRegistry */
export async function fetchScoreHistory(
  id: number,
  sourceAddress?: string,
): Promise<{ credit: ScorePoint[]; green: ScorePoint[] }> {
  const cacheKey = `score_history_${id}`
  const cached = getFromCache<{ credit: ScorePoint[]; green: ScorePoint[] }>(cacheKey)
  if (cached !== null) return cached

  if (!getRegistryContractId()) {
    if (isMainnetActive()) {
      throw new Error('NEXT_PUBLIC_REGISTRY_CONTRACT_ID not set on mainnet')
    }
    return selectScoreHistory(id)
  }

  try {
    const raw = (await simulateRegistryCall(
      'get_score_history',
      [id],
      sourceAddress,
    )) as OnChainScoreHistoryEntryRaw[]

    if (Array.isArray(raw) && raw.length > 0) {
      const credit: ScorePoint[] = raw.map((r, i) => ({
        date: formatScoreDate(r.timestamp, i),
        value: Number(r.credit_quality),
        hash: `0xscore${id}${i}`,
      }))
      const green: ScorePoint[] = raw.map((r, i) => ({
        date: formatScoreDate(r.timestamp, i),
        value: Number(r.green_impact),
        hash: `0xscore${id}${i}`,
      }))
      const history = { credit, green }
      setInCache(cacheKey, history)
      return history
    }
    if (isMainnetActive()) {
      return { credit: [], green: [] }
    }
    return selectScoreHistory(id)
  } catch (error) {
    reportRegistryReadError('get_score_history', error)
    if (isProgrammingError(error) || isMainnetActive()) throw error
    return selectScoreHistory(id)
  }
}

/** Minimum character length enforced by `ProjectRegistry.create_project` for `uri`. */
export const MIN_PROJECT_URI_LENGTH = 8

/** Maximum character length enforced by `ProjectRegistry.create_project` for `uri`. */
export const MAX_PROJECT_URI_LENGTH = 512

/** URI schemes allowed by `ProjectRegistry.create_project`. */
export const ALLOWED_PROJECT_URI_SCHEMES = ['ipfs://', 'https://', 'ar://'] as const

export type ProjectUriError = 'UriTooShort' | 'UriTooLong' | 'InvalidUriScheme'

export type ProjectUriValidationResult =
  { valid: true; uri: string } | { valid: false; error: ProjectUriError }

/**
 * Validates a metadata URI against `ProjectRegistry.create_project` contract rules:
 * - 8 to 512 characters (`UriTooShort` / `UriTooLong`)
 * - must start with `ipfs://`, `https://`, or `ar://` (`InvalidUriScheme`)
 */
export function validateProjectUri(rawUri: string): ProjectUriValidationResult {
  const trimmed = typeof rawUri === 'string' ? rawUri.trim() : ''
  if (trimmed.length < MIN_PROJECT_URI_LENGTH) {
    return { valid: false, error: 'UriTooShort' }
  }
  if (trimmed.length > MAX_PROJECT_URI_LENGTH) {
    return { valid: false, error: 'UriTooLong' }
  }
  const hasAllowedScheme = ALLOWED_PROJECT_URI_SCHEMES.some((scheme) => trimmed.startsWith(scheme))
  if (!hasAllowedScheme) {
    return { valid: false, error: 'InvalidUriScheme' }
  }
  return { valid: true, uri: trimmed }
}

export type MaturityDateError = 'MaturityDateInPast'

export type MaturityDateValidationResult =
  { valid: true; maturityDate: number } | { valid: false; error: MaturityDateError }

/**
 * Validates an optional maturity date against `ProjectRegistry.create_project` contract rules:
 * - `0` / empty / null / undefined means open-ended (`0` on-chain)
 * - otherwise must resolve to a Unix timestamp in seconds strictly in the future (`> nowSeconds`),
 *   or fails with `MaturityDateInPast`.
 */
export function validateMaturityDate(
  input: string | number | bigint | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): MaturityDateValidationResult {
  if (input === null || input === undefined || input === '' || input === 0 || input === 0n) {
    return { valid: true, maturityDate: 0 }
  }

  if (typeof input === 'bigint') {
    if (input < 0n || Number(input) <= nowSeconds) {
      return { valid: false, error: 'MaturityDateInPast' }
    }
    return { valid: true, maturityDate: Number(input) }
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) {
      return { valid: false, error: 'MaturityDateInPast' }
    }
    const floored = Math.floor(input)
    if (floored === 0) return { valid: true, maturityDate: 0 }
    if (floored <= nowSeconds) {
      return { valid: false, error: 'MaturityDateInPast' }
    }
    return { valid: true, maturityDate: floored }
  }

  const trimmed = input.trim()
  if (!trimmed || trimmed === '0') {
    return { valid: true, maturityDate: 0 }
  }

  if (/^-?\d+$/.test(trimmed)) {
    const num = Number(trimmed)
    if (!Number.isSafeInteger(num) || num <= nowSeconds) {
      return { valid: false, error: 'MaturityDateInPast' }
    }
    return { valid: true, maturityDate: num }
  }

  const parsedMs = Date.parse(trimmed)
  if (Number.isNaN(parsedMs)) {
    return { valid: false, error: 'MaturityDateInPast' }
  }
  const seconds = Math.floor(parsedMs / 1000)
  if (seconds <= nowSeconds) {
    return { valid: false, error: 'MaturityDateInPast' }
  }
  return { valid: true, maturityDate: seconds }
}

/** Canonical off-chain project metadata payload generated by ProjectBuilder. */
export interface CanonicalProjectMetadata {
  name: string
  location: string
  type: string
  story: string
  fundingGoal: number
}

/** Normalizes form fields into a canonical project metadata object with deterministic key order. */
export function buildCanonicalProjectMetadata(
  input: CanonicalProjectMetadata,
): CanonicalProjectMetadata {
  return {
    name: String(input.name ?? '').trim(),
    location: String(input.location ?? '').trim(),
    type: String(input.type ?? '').trim(),
    story: String(input.story ?? '').trim(),
    fundingGoal: Number(input.fundingGoal),
  }
}

/** Serializes canonical project metadata to deterministic UTF-8 JSON text. */
export function serializeProjectMetadata(input: CanonicalProjectMetadata): string {
  const canonical = buildCanonicalProjectMetadata(input)
  return JSON.stringify(
    {
      name: canonical.name,
      location: canonical.location,
      type: canonical.type,
      story: canonical.story,
      fundingGoal: canonical.fundingGoal,
    },
    null,
    2,
  )
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** Synchronous FIPS 180-4 SHA-256 hex digest for immediate UI preview before crypto.subtle resolves. */
export function computeSha256Sync(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const bitLen = bytes.length * 8
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false)
  view.setUint32(paddedLen - 4, bitLen >>> 0, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const v15 = w[i - 15]
      const s0 = ((v15 >>> 7) | (v15 << 25)) ^ ((v15 >>> 18) | (v15 << 14)) ^ (v15 >>> 3)
      const v2 = w[i - 2]
      const s1 = ((v2 >>> 17) | (v2 << 15)) ^ ((v2 >>> 19) | (v2 << 13)) ^ (v2 >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, '0')).join('')
}

/**
 * Computes the lowercase 64-char hex SHA-256 `metadata_hash` for a canonical metadata object,
 * JSON string, or raw byte buffer via `crypto.subtle`.
 */
export async function computeProjectMetadataHash(
  input: CanonicalProjectMetadata | string | Uint8Array | ArrayBuffer,
): Promise<string | null> {
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    return computeSha256(input)
  }
  const json = typeof input === 'string' ? input : serializeProjectMetadata(input)
  const bytes = new TextEncoder().encode(json)
  return computeSha256(bytes)
}

/**
 * Encodes the arguments for `ProjectRegistry.create_project(creator, uri, maturity_date, metadata_hash)`:
 * - `creator`: `Address` (`scvAddress`)
 * - `uri`: `String` (`scvString`)
 * - `maturity_date`: `u64` (`scvU64`)
 * - `metadata_hash`: `BytesN<32>` (`scvBytes` of length 32)
 */
export function encodeCreateProjectArgs(params: {
  creator: string
  uri: string
  maturityDate: number | bigint
  metadataHash: string | Uint8Array
}): xdr.ScVal[] {
  const normalizedHash = normalizeHash(params.metadataHash)
  if (!normalizedHash) {
    throw new Error('Invalid metadata_hash: expected 32-byte hex or Uint8Array')
  }
  const hashBytes = Buffer.from(normalizedHash, 'hex')
  return [
    new Address(params.creator.trim()).toScVal(),
    nativeToScVal(params.uri, { type: 'string' }),
    nativeToScVal(BigInt(params.maturityDate), { type: 'u64' }),
    nativeToScVal(hashBytes, { type: 'bytes' }),
  ]
}

/**
 * Encodes the arguments for `ProjectRegistry.verify_metadata_hash(project_id, candidate_hash)`:
 * - `project_id`: `u32` (`scvU32`)
 * - `candidate_hash`: `BytesN<32>` (`scvBytes` of length 32)
 */
export function encodeVerifyMetadataHashArgs(
  projectId: number,
  candidateHash: string | Uint8Array,
): xdr.ScVal[] {
  if (!Number.isInteger(projectId) || projectId < 0 || projectId > 0xffffffff) {
    throw new Error('Invalid project_id: expected u32 integer')
  }
  const normalizedHash = normalizeHash(candidateHash)
  if (!normalizedHash) {
    throw new Error('Invalid candidate_hash: expected 32-byte hex or Uint8Array')
  }
  const hashBytes = Buffer.from(normalizedHash, 'hex')
  return [nativeToScVal(projectId, { type: 'u32' }), nativeToScVal(hashBytes, { type: 'bytes' })]
}

export type CreateProjectErrorCode =
  | 'NotWhitelisted'
  | 'UriTooShort'
  | 'UriTooLong'
  | 'InvalidUriScheme'
  | 'MaturityDateInPast'
  | 'Paused'
  | 'InvalidMetadataHash'
  | 'WalletNotConnected'
  | 'simulationFailed'
  | 'txFailed'

export class RegistryCreateProjectError extends Error {
  readonly code: CreateProjectErrorCode

  constructor(code: CreateProjectErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'RegistryCreateProjectError'
    this.code = code
  }
}

const KNOWN_CREATE_ERROR_CODES = new Set<CreateProjectErrorCode>([
  'NotWhitelisted',
  'UriTooShort',
  'UriTooLong',
  'InvalidUriScheme',
  'MaturityDateInPast',
  'Paused',
])

/** Maps a Soroban simulation error or contract failure into a typed `RegistryCreateProjectError`. */
export function mapRegistryCreateError(error: unknown): RegistryCreateProjectError {
  if (error instanceof RegistryCreateProjectError) {
    return error
  }

  const parsed = parseContractError(error, { source: 'registry' })
  if (parsed?.name && KNOWN_CREATE_ERROR_CODES.has(parsed.name as CreateProjectErrorCode)) {
    return new RegistryCreateProjectError(parsed.name as CreateProjectErrorCode)
  }

  const rawText =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'error' in error
          ? String((error as { error?: unknown }).error ?? '')
          : String(error ?? '')

  for (const known of KNOWN_CREATE_ERROR_CODES) {
    if (rawText.includes(known)) {
      return new RegistryCreateProjectError(known)
    }
  }

  return new RegistryCreateProjectError('simulationFailed', rawText || 'Simulation failed')
}

export interface CreateProjectParams {
  creator: string
  uri: string
  maturityDate?: string | number | bigint | null
  metadataHash: string | Uint8Array
  sign: (xdr: string) => Promise<string>
  nowSeconds?: number
}

export interface CreateProjectResult {
  projectId: number
  hash: string
  uri: string
  maturityDate: number
  metadataHash: string
}

/**
 * Validates, simulates, signs, and submits `ProjectRegistry.create_project(creator, uri, maturity_date, metadata_hash)`.
 * Client-side validation and RPC simulation run BEFORE `sign` is ever invoked so non-whitelisted
 * wallets or invalid parameters never trigger a wallet signing prompt.
 */
export async function submitCreateProject(
  params: CreateProjectParams,
): Promise<CreateProjectResult> {
  const creator = typeof params.creator === 'string' ? params.creator.trim() : ''
  if (!creator) {
    throw new RegistryCreateProjectError('WalletNotConnected')
  }

  const uriResult = validateProjectUri(params.uri)
  if (!uriResult.valid) {
    throw new RegistryCreateProjectError(uriResult.error)
  }

  const maturityResult = validateMaturityDate(params.maturityDate, params.nowSeconds)
  if (!maturityResult.valid) {
    throw new RegistryCreateProjectError(maturityResult.error)
  }

  const normalizedHash = normalizeHash(params.metadataHash)
  if (!normalizedHash) {
    throw new RegistryCreateProjectError('InvalidMetadataHash')
  }

  const scArgs = encodeCreateProjectArgs({
    creator,
    uri: uriResult.uri,
    maturityDate: maturityResult.maturityDate,
    metadataHash: normalizedHash,
  })

  const contractId = getRegistryContractId()
  if (!contractId) {
    if (isMainnetActive()) {
      throw new Error('NEXT_PUBLIC_REGISTRY_CONTRACT_ID not set on mainnet')
    }
    let simulatedProjectId: number | undefined
    if (activeSimulateRegistryCall !== defaultSimulateRegistryCall) {
      try {
        const simRet = await activeSimulateRegistryCall('create_project', scArgs, creator)
        const num = Number(simRet)
        if (Number.isInteger(num) && num >= 0) {
          simulatedProjectId = num
        }
      } catch (err) {
        throw mapRegistryCreateError(err)
      }
    }
    const projectId = simulatedProjectId ?? selectProjects().length + createdProjectHashes.size + 1
    await params.sign(`DEMO_CREATE_PROJECT:${projectId}`)
    createdProjectHashes.set(projectId, normalizedHash)
    return {
      projectId,
      hash: `0x${normalizedHash.slice(0, 16)}`,
      uri: uriResult.uri,
      maturityDate: maturityResult.maturityDate,
      metadataHash: normalizedHash,
    }
  }

  const { rpc, Contract, TransactionBuilder, Transaction, Account, scValToNative } =
    await import('@stellar/stellar-sdk')

  const server = await getSorobanServer(RPC_URL)
  let sourceAccount: InstanceType<typeof Account>
  try {
    const horizon = await getHorizonServer(HORIZON_URL)
    const loaded = await withSimulationTimeout(
      horizon.loadAccount(creator),
      REGISTRY_SIMULATION_TIMEOUT_MS,
    )
    sourceAccount = new Account(loaded.accountId(), loaded.sequenceNumber())
  } catch {
    sourceAccount = new Account(creator, '0')
  }

  const contract = new Contract(contractId)
  const networkPassphrase = NETWORK_PASSPHRASE

  const tx = new TransactionBuilder(sourceAccount, { fee: '100', networkPassphrase })
    .addOperation(contract.call('create_project', ...scArgs))
    .setTimeout(180)
    .build()

  let simResult: Awaited<ReturnType<typeof server.simulateTransaction>>
  try {
    simResult = await withSimulationTimeout(
      server.simulateTransaction(tx),
      REGISTRY_SIMULATION_TIMEOUT_MS,
    )
  } catch (err) {
    throw mapRegistryCreateError(err)
  }

  if ('error' in simResult && simResult.error) {
    throw mapRegistryCreateError(simResult.error)
  }

  let projectIdFromSim: number | undefined
  if ('result' in simResult && simResult.result?.retval) {
    const nativeVal = scValToNative(simResult.result.retval as Parameters<typeof scValToNative>[0])
    const num = Number(nativeVal)
    if (Number.isInteger(num) && num >= 0) {
      projectIdFromSim = num
    }
  }

  const assembled = rpc.assembleTransaction(tx, simResult).build()
  const signedXdr = await params.sign(assembled.toXDR())

  let signedTx: InstanceType<typeof Transaction>
  try {
    signedTx = new Transaction(signedXdr, networkPassphrase)
  } catch {
    signedTx = assembled as InstanceType<typeof Transaction>
  }

  const sendResult = await withSimulationTimeout(
    server.sendTransaction(signedTx),
    REGISTRY_SIMULATION_TIMEOUT_MS,
  )
  if (sendResult.status === 'ERROR') {
    throw new RegistryCreateProjectError('txFailed')
  }

  const txHash =
    sendResult.hash || (typeof signedTx.hash === 'function' ? signedTx.hash().toString('hex') : '')

  let projectIdFromTx: number | undefined
  if (typeof server.getTransaction === 'function' && txHash) {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const txStatus = await withSimulationTimeout(
        server.getTransaction(txHash),
        REGISTRY_SIMULATION_TIMEOUT_MS,
      )
      if (!txStatus || txStatus.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        if (txStatus && 'returnValue' in txStatus && txStatus.returnValue) {
          const decoded = Number(
            scValToNative(txStatus.returnValue as Parameters<typeof scValToNative>[0]),
          )
          if (Number.isInteger(decoded) && decoded >= 0) {
            projectIdFromTx = decoded
          }
        }
        break
      }
      if (txStatus.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new RegistryCreateProjectError('txFailed')
      }
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  const projectId = projectIdFromSim ?? projectIdFromTx ?? 1
  memoryCache.clear()
  createdProjectHashes.set(projectId, normalizedHash)

  return {
    projectId,
    hash: txHash,
    uri: uriResult.uri,
    maturityDate: maturityResult.maturityDate,
    metadataHash: normalizedHash,
  }
}

/**
 * Calls `ProjectRegistry.verify_metadata_hash(project_id, candidate_hash) -> bool`
 * to verify whether `candidateHash` matches the stored on-chain `metadata_hash` for `projectId`.
 */
export async function verifyProjectMetadataHash(
  projectId: number,
  candidateHash: string | Uint8Array,
  sourceAddress = SIMULATION_SOURCE_ADDRESS,
): Promise<boolean> {
  const normalized = normalizeHash(candidateHash)
  if (!normalized) return false

  const scArgs = encodeVerifyMetadataHashArgs(projectId, normalized)
  if (!getRegistryContractId()) {
    if (isMainnetActive()) {
      throw new Error('NEXT_PUBLIC_REGISTRY_CONTRACT_ID not set on mainnet')
    }
    if (activeSimulateRegistryCall !== defaultSimulateRegistryCall) {
      const res = await activeSimulateRegistryCall('verify_metadata_hash', scArgs, sourceAddress)
      return Boolean(res)
    }
    const stored = createdProjectHashes.get(projectId)
    return stored ? stored === normalized : false
  }

  const retval = await simulateRegistryCall('verify_metadata_hash', scArgs, sourceAddress)
  return Boolean(retval)
}
