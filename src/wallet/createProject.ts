/**
 * ProjectRegistry.create_project — the one signed write a whitelisted creator
 * makes from the Creator space (#697).
 *
 * Contract surface (Heliobond/contracts, project_registry):
 *   create_project(creator: Address, uri: String, maturity_date: u64, metadata_hash: BytesN<32>) -> u32
 *   - creator must be whitelisted, otherwise `NotWhitelisted` (#1)
 *   - uri must be 8..512 characters and start with ipfs://, https:// or ar://,
 *     otherwise `UriTooShort` (#2), `UriTooLong` (#3) or `InvalidUriScheme` (#29)
 *   - maturity_date is Unix seconds and must be in the future; 0 means open-ended,
 *     otherwise `MaturityDateInPast` (#4)
 *   - the returned u32 is the new project id; the project starts `Pending`
 *
 * The client validates the same rules before signing, then hashes the canonical
 * metadata JSON with SHA-256 so the creator can pin it at the URI. `verify_metadata_hash`
 * on the registry compares that hash against the bytes served at the URI (#627).
 */

import type { xdr } from '@stellar/stellar-sdk'
import { AppError } from '../lib/appError'
import { parseContractError } from '../lib/contractErrors'
import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  RPC_URL,
  getHorizonServer,
  getSorobanServer,
} from '../config/network'
import type { ProjectType } from '../data/creator'
import {
  REGISTRY_SIMULATION_TIMEOUT_MS,
  fetchTotalProjects,
  withSimulationTimeout,
} from './registry'

/** Metadata URI rules shared with the contract. */
export const METADATA_URI_MIN_LENGTH = 8
export const METADATA_URI_MAX_LENGTH = 512
export const METADATA_URI_SCHEMES = ['ipfs://', 'https://', 'ar://'] as const

/** A BytesN<32> digest. */
export const METADATA_HASH_LENGTH = 32

/** Demo-mode publish delay, mirroring the other simulated transactions. */
const DEMO_PUBLISH_DELAY_MS = 1500

const TX_POLL_TIMEOUT_MS = 30_000
const TX_POLL_INTERVAL_MS = 2_000
const RPC_TIMEOUT_MS = 5_000

export type MetadataUriProblem = 'tooShort' | 'tooLong' | 'invalidScheme'
export type MaturityDateProblem = 'invalid' | 'inPast'

/** Validates a metadata URI against the contract's length and scheme rules. */
export function validateMetadataUri(uri: string): MetadataUriProblem | null {
  const value = uri.trim()
  if (value.length < METADATA_URI_MIN_LENGTH) return 'tooShort'
  if (value.length > METADATA_URI_MAX_LENGTH) return 'tooLong'
  if (!METADATA_URI_SCHEMES.some((scheme) => value.startsWith(scheme))) return 'invalidScheme'
  return null
}

/**
 * Validates a maturity date in Unix seconds. 0 is the contract's "open-ended"
 * value; every other value must be in the future.
 */
export function validateMaturityDate(
  seconds: number | bigint,
  nowSeconds = Math.floor(Date.now() / 1000),
): MaturityDateProblem | null {
  const value = typeof seconds === 'bigint' ? Number(seconds) : seconds
  if (!Number.isSafeInteger(value) || value < 0) return 'invalid'
  if (value === 0) return null
  return value <= nowSeconds ? 'inPast' : null
}

/**
 * Converts a `<input type="date">` value (YYYY-MM-DD) to Unix seconds at
 * midnight UTC. Returns null for an empty or impossible date.
 */
export function maturityDateToUnixSeconds(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const ms = Date.UTC(year, month - 1, day)
  if (!Number.isFinite(ms)) return null
  const date = new Date(ms)
  // Date.UTC rolls impossible dates over (Feb 31 -> Mar 3); reject them instead.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return Math.floor(ms / 1000)
}

export interface ProjectMetadataInput {
  name: string
  location: string
  type: ProjectType
  story: string
  fundingGoal: number
}

/**
 * Canonical metadata JSON for the registry URI. Keys are written in a fixed
 * order and the same bytes are hashed and downloaded, so the hash a creator
 * pins always matches what investors fetch. Shape stays compatible with
 * `validateOffChainMetadata` in registry.ts.
 */
export function serializeProjectMetadata(input: ProjectMetadataInput): string {
  const story = input.story.trim()
  return JSON.stringify(
    {
      name: input.name.trim(),
      description: story,
      location: input.location.trim(),
      type: input.type,
      story,
      fundingGoal: input.fundingGoal,
    },
    null,
    2,
  )
}

/** SHA-256 of the exact metadata JSON bytes. */
export async function computeMetadataHash(metadataJson: string): Promise<Uint8Array> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
  if (!subtle) {
    throw new AppError('unexpectedError')
  }
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(metadataJson) as BufferSource,
  )
  return new Uint8Array(digest)
}

/** Lowercase hex rendering of a metadata hash. */
export function metadataHashHex(hash: Uint8Array): string {
  return Array.from(hash)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Builds the create_project ScVal arguments in contract order:
 * Address, String, u64, BytesN<32>.
 */
export async function buildCreateProjectArgs(
  creator: string,
  uri: string,
  maturityDate: number,
  metadataHash: Uint8Array,
): Promise<xdr.ScVal[]> {
  if (metadataHash.length !== METADATA_HASH_LENGTH) {
    throw new AppError('unexpectedError')
  }
  const maturityProblem = validateMaturityDate(maturityDate)
  if (maturityProblem) {
    throw new CreateProjectError('maturity', `Maturity date rejected: ${maturityProblem}`)
  }
  const { Address, nativeToScVal } = await import('@stellar/stellar-sdk')
  return [
    new Address(creator).toScVal(),
    nativeToScVal(uri.trim(), { type: 'string' }),
    nativeToScVal(BigInt(maturityDate), { type: 'u64' }),
    // Soroban accepts a 32-byte ScvBytes wherever the spec declares BytesN<32>.
    nativeToScVal(metadataHash, { type: 'bytes' }),
  ]
}

export type CreateProjectProblem = 'notWhitelisted' | 'uri' | 'maturity' | 'contract'

/** A create_project failure with enough detail to show the right inline message. */
export class CreateProjectError extends Error {
  readonly problem: CreateProjectProblem
  readonly code: number | null

  constructor(problem: CreateProjectProblem, message: string, code: number | null = null) {
    super(message)
    this.name = 'CreateProjectError'
    this.problem = problem
    this.code = code
  }
}

/** Maps a RegistryError to the builder message that should handle it. */
export function classifyCreateProjectError(error: unknown): CreateProjectProblem {
  const parsed = parseContractError(error, { source: 'registry' })
  switch (parsed?.name) {
    case 'NotWhitelisted':
      return 'notWhitelisted'
    case 'UriTooShort':
    case 'UriTooLong':
    case 'InvalidUriScheme':
      return 'uri'
    case 'MaturityDateInPast':
      return 'maturity'
    default:
      return 'contract'
  }
}

function toCreateProjectError(error: unknown): CreateProjectError {
  if (error instanceof CreateProjectError) return error
  const parsed = parseContractError(error, { source: 'registry' })
  return new CreateProjectError(
    classifyCreateProjectError(error),
    error instanceof Error ? error.message : String(error),
    parsed?.code ?? null,
  )
}

function getRegistryContractId(): string | undefined {
  return process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID
}

async function withTimeout<T>(
  promise: Promise<T>,
  message: string,
  ms = RPC_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    })
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Simulates create_project with the connected wallet as `creator` and returns
 * the project id the call would assign. Throws `CreateProjectError`, which lets
 * the builder show `NotWhitelisted` inline without ever opening the wallet
 * prompt.
 */
export async function simulateCreateProject(
  creator: string,
  uri: string,
  maturityDate: number,
  metadataHash: Uint8Array,
): Promise<number> {
  const contractId = getRegistryContractId()
  if (!contractId) {
    // Fixture mode: every screen runs without a deployed registry.
    const total = await fetchTotalProjects().catch(() => 0)
    return total + 1
  }

  const { Contract, TransactionBuilder, Account, scValToNative } =
    await import('@stellar/stellar-sdk')
  const args = await buildCreateProjectArgs(creator, uri, maturityDate, metadataHash)
  const server = await getSorobanServer(RPC_URL)

  const source = new Account(creator, '0')
  const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(contractId).call('create_project', ...args))
    .setTimeout(0)
    .build()

  const sim = await withSimulationTimeout(
    server.simulateTransaction(tx),
    REGISTRY_SIMULATION_TIMEOUT_MS,
  )
  if ('error' in sim) throw toCreateProjectError(sim.error)
  if (!sim.result?.retval) throw new CreateProjectError('contract', 'create_project returned no id')

  const projectId = Number(scValToNative(sim.result.retval))
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new CreateProjectError('contract', 'create_project returned an invalid id')
  }
  return projectId
}

export interface CreatedProject {
  projectId: number
  hash: string
}

/**
 * Simulates, signs, submits and confirms create_project. Returns the new project
 * id read from the transaction's return value, plus the transaction hash for the
 * explorer link.
 *
 * Without NEXT_PUBLIC_REGISTRY_CONTRACT_ID the app runs on its fixtures, so the
 * publish is simulated locally like every other demo transaction.
 */
export async function submitCreateProject(
  creator: string,
  uri: string,
  maturityDate: number,
  metadataHash: Uint8Array,
  sign: (xdr: string) => Promise<string>,
): Promise<CreatedProject> {
  const contractId = getRegistryContractId()
  if (!contractId) {
    await new Promise((resolve) => setTimeout(resolve, DEMO_PUBLISH_DELAY_MS))
    const total = await fetchTotalProjects().catch(() => 0)
    return {
      projectId: total + 1,
      hash: `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`,
    }
  }

  const { rpc, Contract, TransactionBuilder, Transaction, scValToNative } =
    await import('@stellar/stellar-sdk')
  const args = await buildCreateProjectArgs(creator, uri, maturityDate, metadataHash)
  const server = await getSorobanServer(RPC_URL)
  const horizon = await getHorizonServer(HORIZON_URL)

  const account = await withTimeout(
    horizon.loadAccount(creator),
    'Stellar Horizon timed out loading account',
  )
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call('create_project', ...args))
    .setTimeout(180)
    .build()

  const sim = await withSimulationTimeout(
    server.simulateTransaction(tx),
    REGISTRY_SIMULATION_TIMEOUT_MS,
  )
  if ('error' in sim) throw toCreateProjectError(sim.error)
  if (!sim.result?.retval) throw new CreateProjectError('contract', 'create_project returned no id')

  const simulatedId = Number(scValToNative(sim.result.retval))
  const assembled = rpc.assembleTransaction(tx, sim).build()
  const signedXdr = await sign(assembled.toXDR())
  const signedTx = new Transaction(signedXdr, NETWORK_PASSPHRASE)

  const send = await withTimeout(
    server.sendTransaction(signedTx),
    'Stellar RPC timed out submitting transaction',
  )
  if (send.status === 'ERROR') throw toCreateProjectError('create_project failed to submit')

  const confirmation = await waitForConfirmation(server, send.hash)
  const confirmedId = readProjectId(confirmation, scValToNative) ?? simulatedId
  if (!Number.isInteger(confirmedId) || confirmedId <= 0) {
    throw new CreateProjectError('contract', 'create_project confirmed without a project id')
  }
  return { projectId: confirmedId, hash: send.hash }
}

/** Poll getTransaction until the create_project transaction reaches a terminal state. */
async function waitForConfirmation(
  server: Awaited<ReturnType<typeof getSorobanServer>>,
  hash: string,
): Promise<{ returnValue?: unknown }> {
  const { rpc } = await import('@stellar/stellar-sdk')
  const deadline = Date.now() + TX_POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, TX_POLL_INTERVAL_MS))
    const result = await withTimeout(server.getTransaction(hash), 'Stellar RPC timed out')
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return result as unknown as { returnValue?: unknown }
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new CreateProjectError('contract', 'create_project failed on-chain')
    }
  }
  throw new CreateProjectError('contract', 'Timed out waiting for create_project')
}

function readProjectId(
  confirmation: { returnValue?: unknown },
  scValToNative: (value: never) => unknown,
): number | null {
  const value = confirmation.returnValue
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  try {
    const native = Number(scValToNative(value as never))
    return Number.isFinite(native) ? native : null
  } catch {
    return null
  }
}
