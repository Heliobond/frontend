/**
 * ProjectRegistry client for reading on-chain projects and details.
 * Interacts with deployed Soroban ProjectRegistry contract when NEXT_PUBLIC_REGISTRY_CONTRACT_ID is configured.
 * Implements short-window caching, off-chain metadata resolution, and hash verification.
 * Gracefully falls back to bundled fixtures in demo mode.
 */

import { type Project, type ProjectType } from '../data'
import { type ProjectDetail, type ScorePoint } from '../data/projectDetails'
import {
  selectProjects,
  selectProjectById,
  selectProjectDetail,
  selectScoreHistory,
} from '../state/selectors'
import {
  SOROBAN_RPC_URL as RPC_URL,
  NETWORK_PASSPHRASE,
  getSorobanServer,
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

export function clearRegistryCache(): void {
  memoryCache.clear()
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
    throw new Error(`Simulate failed for ${method}: ${simResult.error}`)
  }
  if (!simResult.result?.retval) {
    throw new Error(`Simulate failed for ${method}: empty simulation result`)
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
    return new Date(seconds * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
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
