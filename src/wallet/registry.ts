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
  HORIZON_URL,
  allowHttpFor,
} from '../config/network'
import { reportError } from '../lib/errorReporting'

function getRegistryContractId(): string | undefined {
  return process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID
}

const CACHE_TTL_MS = 30000

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

  const { rpc, Contract, TransactionBuilder, Account, nativeToScVal, scValToNative } =
    await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
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

  const simResult = await server.simulateTransaction(tx)
  if ('error' in simResult) {
    throw new Error(`Simulate failed for ${method}: ${simResult.error}`)
  }
  if (!simResult.result?.retval) {
    throw new Error(`Simulate failed for ${method}: empty simulation result`)
  }
  return scValToNative(simResult.result.retval)
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
export async function computeSha256(
  content: ArrayBuffer | Uint8Array | string,
): Promise<string | null> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
  if (!subtle) {
    return null
  }
  let data: Uint8Array
  if (typeof content === 'string') {
    data = new TextEncoder().encode(content)
  } else if (content instanceof Uint8Array) {
    data = content
  } else {
    data = new Uint8Array(content)
  }
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

/** Map on-chain ProjectData plus its id and optional metadata to a UI Project. */
export function mapOnChainProject(
  raw: OnChainProjectRaw,
  id: number,
  metadata?: OffChainMetadata,
): Project {
  const credit = Number(raw.credit_quality ?? 80)
  const green = Number(raw.green_impact ?? 80)

  const fallback = selectProjectById(id)

  const fundedAmount = fallback?.fundedAmount ?? 0
  const fundingGoal = metadata?.fundingGoal || fallback?.fundingGoal || 1000000

  return {
    id,
    name: metadata?.name || fallback?.name || `Bond Project #${id}`,
    location: metadata?.location || fallback?.location || 'Stellar Network',
    type: metadata?.type || fallback?.type || 'Solar',
    credit: Number.isFinite(credit) ? credit : 80,
    green: Number.isFinite(green) ? green : 80,
    funded: `$${fundedAmount.toLocaleString('en-US')}`,
    fundedAmount,
    fundingGoal,
    status: mapProjectStatus(raw.status) ?? fallback?.status ?? 'open',
    priceHistory: metadata?.priceHistory || fallback?.priceHistory || [],
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
    return selectProjects().length
  }

  try {
    const retval = await simulateRegistryCall('total_projects', [], sourceAddress)
    const total = Number(retval)
    setInCache(cacheKey, total)
    return total
  } catch (error) {
    reportRegistryReadError('total_projects', error)
    if (isProgrammingError(error)) throw error
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
    if (isProgrammingError(error)) throw error
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
      if (!fallbackProject || !fallbackDetail) return null
      return {
        project: fallbackProject,
        detail: fallbackDetail,
        verifiedMetadata: 'unverified',
      }
    }

    let verifiedMetadata: MetadataVerificationStatus = 'unverified'
    let offChainMetadata: OffChainMetadata | undefined

    if (raw.uri) {
      try {
        const res = await fetch(raw.uri)
        if (res.ok) {
          const rawBytes = await res.arrayBuffer()
          const expected = normalizeHash(raw.metadata_hash)

          if (expected) {
            const computedHash = await computeSha256(rawBytes)
            if (computedHash === null) {
              // crypto.subtle is unavailable (non-secure context) -> unverified
              verifiedMetadata = 'unverified'
            } else if (computedHash.toLowerCase() !== expected.toLowerCase()) {
              // Computed hash differs from on-chain hash -> mismatch
              verifiedMetadata = 'mismatch'
            } else {
              // Hash matched on-chain hash! Parse JSON payload.
              try {
                const text = new TextDecoder().decode(rawBytes)
                offChainMetadata = JSON.parse(text)
                verifiedMetadata = 'verified'
              } catch {
                // Parse failure on correctly hashed content fails closed to unverified
                verifiedMetadata = 'unverified'
              }
            }
          } else {
            // Missing or malformed on-chain metadata_hash -> unverified
            verifiedMetadata = 'unverified'
            try {
              const text = new TextDecoder().decode(rawBytes)
              offChainMetadata = JSON.parse(text)
            } catch {
              // Ignore parse error when hash is missing
            }
          }
        } else {
          // HTTP error response from metadata host -> unverified
          verifiedMetadata = 'unverified'
        }
      } catch {
        // Network or fetch failure -> unverified
        verifiedMetadata = 'unverified'
      }
    } else {
      // Missing metadata_uri -> unverified
      verifiedMetadata = 'unverified'
    }

    const project = mapOnChainProject(raw, id, offChainMetadata)

    let scoreHistory = fallbackDetail?.scoreHistory
    try {
      const onChainHistory = await fetchScoreHistory(id, sourceAddress)
      if (onChainHistory.credit.length > 0 || onChainHistory.green.length > 0) {
        scoreHistory = onChainHistory
      }
    } catch {
      /* use fallback scoreHistory */
    }

    const detail: ProjectDetail = fallbackDetail ?? {
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
    if (isProgrammingError(error)) throw error
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
    return selectScoreHistory(id)
  } catch (error) {
    reportRegistryReadError('get_score_history', error)
    if (isProgrammingError(error)) throw error
    return selectScoreHistory(id)
  }
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate metadata URI according to ProjectRegistry contract constraints:
 * - 8 to 512 characters
 * - Scheme must be ipfs://, https://, or ar://
 */
export function validateMetadataUri(uri: string): ValidationResult {
  if (!uri || typeof uri !== 'string') {
    return { valid: false, error: 'Metadata URI is required' }
  }
  const trimmed = uri.trim()
  if (trimmed.length < 8) {
    return { valid: false, error: 'URI must be at least 8 characters' }
  }
  if (trimmed.length > 512) {
    return { valid: false, error: 'URI cannot exceed 512 characters' }
  }
  const hasValidScheme =
    trimmed.startsWith('ipfs://') || trimmed.startsWith('https://') || trimmed.startsWith('ar://')
  if (!hasValidScheme) {
    return { valid: false, error: 'URI must start with ipfs://, https://, or ar://' }
  }
  return { valid: true }
}

/**
 * Validate maturity date:
 * - 0 is open-ended (valid)
 * - If > 0, must be in the future (Unix timestamp in seconds)
 */
export function validateMaturityDate(
  maturityDateSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): ValidationResult {
  if (maturityDateSeconds === 0) {
    return { valid: true }
  }
  if (maturityDateSeconds < 0 || !Number.isFinite(maturityDateSeconds)) {
    return { valid: false, error: 'Invalid maturity date' }
  }
  if (maturityDateSeconds <= nowSeconds) {
    return { valid: false, error: 'Maturity date must be in the future' }
  }
  return { valid: true }
}

export interface ProjectMetadataPayload {
  name: string
  location: string
  type: string
  story: string
  fundingGoal: number
}

/**
 * Build canonical JSON string for metadata so SHA-256 is deterministic
 */
export function buildCanonicalMetadata(payload: ProjectMetadataPayload): string {
  return JSON.stringify(
    {
      name: payload.name.trim(),
      location: payload.location.trim(),
      type: payload.type,
      story: payload.story.trim(),
      fundingGoal: Number(payload.fundingGoal) || 0,
    },
    null,
    2,
  )
}

export class NotWhitelistedError extends Error {
  constructor(message = 'Wallet is not whitelisted to create projects') {
    super(message)
    this.name = 'NotWhitelistedError'
  }
}

/**
 * Encode arguments for ProjectRegistry.create_project:
 * creator: Address, uri: String, maturity_date: u64, metadata_hash: BytesN<32>
 */
export async function encodeCreateProjectArgs(
  creator: string,
  uri: string,
  maturityDateSeconds: number,
  metadataHashHex: string,
) {
  const { Address, nativeToScVal, xdr } = await import('@stellar/stellar-sdk')
  const creatorScVal = new Address(creator).toScVal()
  const uriScVal = nativeToScVal(uri, { type: 'string' })
  const maturityScVal = nativeToScVal(BigInt(maturityDateSeconds), { type: 'u64' })

  const cleanHash = normalizeHash(metadataHashHex)
  if (!cleanHash) {
    throw new Error('Invalid metadata hash: must be 32 bytes (64 hex characters)')
  }
  const hashBytes = Buffer.from(cleanHash, 'hex')
  const hashScVal = xdr.ScVal.scvBytes(hashBytes)

  return [creatorScVal, uriScVal, maturityScVal, hashScVal]
}

export interface CreateProjectResult {
  projectId: number
  hash: string
}

/**
 * Simulates and submits create_project to ProjectRegistry contract.
 * If contract is not configured, runs in demo mode.
 */
export async function submitCreateProject(
  creator: string,
  uri: string,
  maturityDateSeconds: number,
  metadataHashHex: string,
  sign: (xdr: string) => Promise<string>,
): Promise<CreateProjectResult> {
  const uriCheck = validateMetadataUri(uri)
  if (!uriCheck.valid) throw new Error(uriCheck.error)

  const maturityCheck = validateMaturityDate(maturityDateSeconds)
  if (!maturityCheck.valid) throw new Error(maturityCheck.error)

  const contractId = getRegistryContractId()
  if (!contractId) {
    // Demo mode: simulate delay and return generated project ID
    await new Promise((r) => setTimeout(r, 1000))
    const mockId = Math.floor(100 + Math.random() * 900)
    return {
      projectId: mockId,
      hash: `demo_create_${mockId}_${Date.now().toString(36)}`,
    }
  }

  const { rpc, Contract, TransactionBuilder, Horizon, Transaction, scValToNative } =
    await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
  const horizon = new Horizon.Server(HORIZON_URL)
  const contract = new Contract(contractId)
  const networkPassphrase = NETWORK_PASSPHRASE

  const scArgs = await encodeCreateProjectArgs(creator, uri, maturityDateSeconds, metadataHashHex)

  const account = await horizon.loadAccount(creator)

  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase })
    .addOperation(contract.call('create_project', ...scArgs))
    .setTimeout(180)
    .build()

  const simResult = await server.simulateTransaction(tx)
  if ('error' in simResult) {
    const errStr = String(simResult.error)
    if (errStr.includes('NotWhitelisted') || errStr.includes('Error(Contract, #1)')) {
      throw new NotWhitelistedError()
    }
    if (
      errStr.includes('UriTooShort') ||
      errStr.includes('InvalidUriScheme') ||
      errStr.includes('UriTooLong')
    ) {
      throw new Error(`Registry URI validation failed: ${errStr}`)
    }
    if (errStr.includes('MaturityDateInPast')) {
      throw new Error('Maturity date must be in the future')
    }
    throw new Error(`Simulation failed: ${errStr}`)
  }

  if (simResult.result?.retval) {
    const res = scValToNative(simResult.result.retval)
    if (typeof res === 'object' && res !== null && 'error' in res) {
      throw new Error(`Contract error: ${JSON.stringify(res)}`)
    }
  }

  const assembled = rpc.assembleTransaction(tx, simResult).build()
  const signedXdr = await sign(assembled.toXDR())
  const signedTx = new Transaction(signedXdr, networkPassphrase)

  const sendResult = await server.sendTransaction(signedTx)
  if (sendResult.status === 'ERROR') {
    throw new Error(`Send transaction failed: ${JSON.stringify(sendResult.errorResult)}`)
  }

  const deadline = Date.now() + 30000
  let projectReturnId = 1
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const txStatus = await server.getTransaction(sendResult.hash)
    if (txStatus.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      if (txStatus.returnValue) {
        projectReturnId = Number(scValToNative(txStatus.returnValue)) || 1
      }
      break
    }
    if (txStatus.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error('Transaction failed on-chain')
    }
  }

  clearRegistryCache()
  return {
    projectId: projectReturnId,
    hash: sendResult.hash,
  }
}
