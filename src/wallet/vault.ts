import { recordTransaction, updateTransaction, TransactionPendingError } from './transactions'
// InvestmentVault client — synchronous simulation + async on-chain reads.
//
// The sync `vault` object mirrors the Soroban vault's surface so deposit &
// withdraw screens can use it for immediate previews (demo / no-config mode).
//
// When NEXT_PUBLIC_VAULT_CONTRACT_ID is set, the async functions below read
// directly from the deployed Soroban contract via RPC:
//   fetchSharePrice / fetchTotalAssets / fetchPortfolio  — view reads
//   submitDeposit / submitWithdraw / submitClaim / submitClaimYield — signed txs
//
// Argument lists follow the InvestmentVault ABI (Heliobond/contracts):
//   deposit(usdc_amount: i128, min_shares: i128) -> i128
//   withdraw(shares_amount: i128, min_usdc_return: i128) -> i128
//   claim() -> i128                       (settles queued withdrawals, FIFO)
//   claim_yield(from: Address) -> i128
//   total_assets() / convert_to_assets(shares: i128) / get_portfolio(account: Address)
// Amounts are i128 scaled by 10^7 (USDC and HBS shares both use 7 decimals).
//
// In demo mode (isDemo flag) or when env vars are absent, everything falls
// back gracefully — no errors surface to the user.

import { selectSharePrice } from '../state/selectors'
import { reportError } from '../lib/errorReporting'
import {
  STELLAR_NETWORK,
  SOROBAN_RPC_URL as RPC_URL,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  allowHttpFor,
  passphraseForNetwork,
  USDC_SAC_ID as CONFIG_USDC_SAC_ID,
} from '../config/network'
import type { xdr as XdrTypes } from '@stellar/stellar-sdk'
import { notifyTransactionConfirmed } from './vaultEvents'
import {
  validateMemo,
  validateStellarPayment,
  validateStellarAddress,
  isValidStellarAddress,
  validatePublicKey,
  isValidPublicKey,
  type StellarMemoType,
  type AddressValidationResult,
} from '../lib/stellarPayment'
import { MIN_DEPOSIT_USDC, MIN_WITHDRAW_SHARES } from '../config/vault'

/** USDC and HBS shares are i128 values with 7 decimals on-chain. */
const SCALE = 1e7

/** Convert a display amount to the contract's i128 units. */
export function toStroops(amount: number): bigint {
  return BigInt(Math.round(amount * SCALE))
}

export {
  validateStellarAddress,
  isValidStellarAddress,
  validatePublicKey,
  isValidPublicKey,
  type AddressValidationResult,
}

export interface WithdrawPreview {
  assets: number
  sharePrice: number
  networkFee: number
}

export interface WithdrawResult {
  hash: string
  queued: boolean
  estimatedAmount?: number
  toString(): string
}

export function createWithdrawResult(
  hash: string,
  queued: boolean,
  estimatedAmount?: number,
): WithdrawResult {
  return {
    hash,
    queued,
    ...(estimatedAmount === undefined ? {} : { estimatedAmount }),
    toString() {
      return this.hash
    },
  }
}
/** total_assets / total_supply. Constant in the mock; a live read on-chain. */
export const SHARE_PRICE = selectSharePrice()

/** Number of decimal places used when formatting share prices. */
export const SHARE_PRICE_DECIMALS = 7

/** Formats a share price with consistent precision across all screens. */
export function formatSharePrice(sharePrice: number): string {
  return sharePrice.toFixed(SHARE_PRICE_DECIMALS)
}

/** Simulated pending delay for deposit transactions in demo mode. */
export const SIMULATED_DEPOSIT_DELAY_MS = 2000

/** Simulated pending delay for withdraw transactions in demo mode. */
export const SIMULATED_WITHDRAW_DELAY_MS = 2000

export interface DepositPreview {
  shares: number
  sharePrice: number
  /** USDC; sub-cent on Stellar. */
  networkFee: number
}

export const vault = {
  sharePrice: () => SHARE_PRICE,

  /** convert_to_shares(usdc) — what you receive for a deposit. */
  convertToShares: (usdc: number): number => usdc / SHARE_PRICE,

  /** convert_to_assets(shares) — what shares are worth on withdraw. */
  convertToAssets: (shares: number): number => shares * SHARE_PRICE,

  previewDeposit: (usdc: number): DepositPreview => ({
    shares: usdc / SHARE_PRICE,
    sharePrice: SHARE_PRICE,
    networkFee: 0.00001,
  }),

  previewWithdraw: (usdc: number): WithdrawPreview => ({
    assets: usdc,
    sharePrice: SHARE_PRICE,
    networkFee: 0.00001,
  }),
}

// ---------------------------------------------------------------------------
// Async Soroban client
// ---------------------------------------------------------------------------

const CONTRACT_ID = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
const USDC_SAC_ID = process.env.NEXT_PUBLIC_USDC_SAC_ID || CONFIG_USDC_SAC_ID

/** Max time to wait for a Stellar RPC/Horizon response before treating it as offline. */
const RPC_TIMEOUT_MS = 5000
let cachedSharePrice = SHARE_PRICE
let cachedTotalAssets: number | null = null
let offline = false
const offlineListeners = new Set<(offline: boolean) => void>()

function setOffline(nextOffline: boolean) {
  if (offline === nextOffline) return
  offline = nextOffline
  offlineListeners.forEach((listener) => {
    try {
      listener(nextOffline)
    } catch {
      // Listener errors must not break network timeout fallbacks.
    }
  })
}

/** Returns true when the last Stellar network call timed out. */
export function isOffline(): boolean {
  return offline
}

/** Subscribe to offline status changes. Returns an unsubscribe function. */
export function onOfflineChange(listener: (offline: boolean) => void): () => void {
  offlineListeners.add(listener)
  return () => {
    offlineListeners.delete(listener)
  }
}

/**
 * True only for a transport-level failure: a timeout or a fetch/network error.
 * That is the *whole* meaning of "offline" — a Soroban simulate result (e.g. a
 * contract panic), a malformed request, or a bad address is not a connectivity
 * problem and must never flip the global offline flag (issue #624).
 */
function isTransportError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('fetch failed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ENOTFOUND')
  )
}

/** Reject if a Stellar network call takes longer than RPC_TIMEOUT_MS. */
async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        setOffline(true)
        reportError(new Error(message), { kind: 'rpc-timeout' })
        reject(new Error(message))
      }, RPC_TIMEOUT_MS)
    })
    const result = await Promise.race([promise, timeout])
    setOffline(false)
    return result
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Call a Soroban view function (no state mutation) and return the raw ScVal. */
// One shared import so parallel simulations (fetchVaultLimits) all resolve the same SDK module.
let sdkImport: Promise<typeof import('@stellar/stellar-sdk')> | undefined
function loadSdk() {
  return (sdkImport ??= import('@stellar/stellar-sdk'))
}

async function sorobanSimulate(
  sourceAddress: string,
  method: string,
  args: XdrTypes.ScVal[] = [],
  network: string = STELLAR_NETWORK,
  targetContractId: string = CONTRACT_ID!,
): Promise<XdrTypes.ScVal> {
  const { rpc, Contract, TransactionBuilder, Account } = await loadSdk()

  const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
  const contract = new Contract(targetContractId)
  // Sequence '0' is fine for simulation — only the address format matters.
  const source = new Account(sourceAddress, '0')
  const networkPassphrase = passphraseForNetwork(network === 'public' ? 'PUBLIC' : 'TESTNET')

  const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase })
    .addOperation(contract.call(method, ...args))
    .setTimeout(0)
    .build()

  const result = (await withTimeout(
    server.simulateTransaction(tx),
    'Stellar RPC timed out during simulation',
  )) as { error?: string; result?: { retval: unknown } }
  if ('error' in result) {
    // A simulate error is a chain-level outcome (a contract panic, a malformed
    // request, ...), never a connectivity failure — surface it without letting
    // callers flip the offline flag (issue #624).
    throw new Error(`Soroban simulate error: ${result.error}`)
  }
  if (!result.result) throw new Error('Soroban simulate returned no result')
  return result.result.retval as XdrTypes.ScVal
}

/**
 * Read the share price from the on-chain vault. The vault has no share_price
 * view, so this reads convert_to_assets(1 share); an empty vault (0) mints 1:1.
 * Throws when NEXT_PUBLIC_VAULT_CONTRACT_ID is not set — callers should catch
 * and fall back to the mock value.
 */
export async function fetchSharePrice(
  sourceAddress: string,
  network = STELLAR_NETWORK,
): Promise<string> {
  if (!CONTRACT_ID) throw new Error('NEXT_PUBLIC_VAULT_CONTRACT_ID not set')
  const { scValToNative, nativeToScVal } = await import('@stellar/stellar-sdk')
  try {
    const oneShare = nativeToScVal(toStroops(1), { type: 'i128' })
    const retval = await sorobanSimulate(sourceAddress, 'convert_to_assets', [oneShare], network)
    const assetsPerShare = Number(scValToNative(retval)) / SCALE
    cachedSharePrice = assetsPerShare > 0 ? assetsPerShare : 1
    return formatSharePrice(cachedSharePrice)
  } catch (e) {
    // Only a transport failure means "offline"; rethrow otherwise/successively so
    // callers keep `fetchedAt` at the last real success (issue #624).
    if (isTransportError(e)) setOffline(true)
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/**
 * Read total_assets (USDC) from the on-chain vault.
 * Throws when NEXT_PUBLIC_VAULT_CONTRACT_ID is not set.
 */
export async function fetchTotalAssets(
  sourceAddress: string,
  network = STELLAR_NETWORK,
): Promise<number> {
  if (!CONTRACT_ID) throw new Error('NEXT_PUBLIC_VAULT_CONTRACT_ID not set')
  const { scValToNative } = await import('@stellar/stellar-sdk')
  try {
    const retval = await sorobanSimulate(sourceAddress, 'total_assets', [], network)
    cachedTotalAssets = Number(scValToNative(retval)) / SCALE
    return cachedTotalAssets
  } catch (e) {
    if (isTransportError(e)) setOffline(true)
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/**
 * Read vault utilization in basis points (10000 = 100%).
 * Returns 0 when not available.
 */
export async function fetchUtilizationBps(
  sourceAddress: string,
  network = STELLAR_NETWORK,
): Promise<number> {
  if (!CONTRACT_ID) return 0
  const { scValToNative } = await import('@stellar/stellar-sdk')
  try {
    const retval = await sorobanSimulate(sourceAddress, 'get_utilization_bps', [], network)
    return Number(scValToNative(retval))
  } catch (e) {
    if (isTransportError(e)) setOffline(true)
    throw e instanceof Error ? e : new Error(String(e))
  }
}

export interface VaultLimits {
  paused: boolean
  minDeposit: number
  minWithdrawShares: number
  maxTx: number
  lockExpiresAt: number
  utilizationBps: number
}

export async function fetchVaultLimits(
  sourceAddress: string,
  network = STELLAR_NETWORK,
): Promise<VaultLimits> {
  const defaults: VaultLimits = {
    paused: false,
    minDeposit: MIN_DEPOSIT_USDC,
    minWithdrawShares: MIN_WITHDRAW_SHARES,
    maxTx: 482,
    lockExpiresAt: 0,
    utilizationBps: 0,
  }

  if (!CONTRACT_ID || offline) {
    return defaults
  }

  const { scValToNative, Address } = await import('@stellar/stellar-sdk')

  try {
    const [pausedVal, lockVal, maxTxVal, utilVal] = await Promise.all([
      sorobanSimulate(sourceAddress, 'is_paused', [], network).catch(() => undefined),
      sorobanSimulate(
        sourceAddress,
        'get_deposit_lock_expiry',
        [new Address(sourceAddress).toScVal()],
        network,
      ).catch(() => undefined),
      sorobanSimulate(sourceAddress, 'max_transaction_amount', [], network).catch(() => undefined),
      sorobanSimulate(sourceAddress, 'get_utilization_bps', [], network).catch(() => undefined),
    ])

    return {
      paused: pausedVal !== undefined ? Boolean(scValToNative(pausedVal)) : defaults.paused,
      minDeposit: defaults.minDeposit,
      minWithdrawShares: defaults.minWithdrawShares,
      maxTx: maxTxVal !== undefined ? Number(scValToNative(maxTxVal)) / SCALE : defaults.maxTx,
      lockExpiresAt:
        lockVal !== undefined ? Number(scValToNative(lockVal)) : defaults.lockExpiresAt,
      utilizationBps:
        utilVal !== undefined ? Number(scValToNative(utilVal)) : defaults.utilizationBps,
    }
  } catch {
    // An unreachable node or a missing contract must not break the screen;
    // the documented defaults are safe to render.
    return defaults
  }
}

export interface OnChainPortfolio {
  /** HBS shares held. */
  shares: number
  /** Current USDC redemption value of those shares. */
  usdcValue: number
  /** Unclaimed yield in USDC. */
  claimableYield: number
  /** Share of the pool in basis points (0–10 000). */
  shareOfPoolBps: number
  /** Lifetime USDC deposited. */
  totalDeposited: number
}

/**
 * Read get_portfolio(account) — the investor's on-chain position.
 * Throws when NEXT_PUBLIC_VAULT_CONTRACT_ID is not set or the read fails.
 */
export async function fetchPortfolio(account: string): Promise<OnChainPortfolio> {
  if (!CONTRACT_ID) throw new Error('NEXT_PUBLIC_VAULT_CONTRACT_ID not set')
  const { Address, scValToNative } = await import('@stellar/stellar-sdk')
  const retval = await sorobanSimulate(account, 'get_portfolio', [new Address(account).toScVal()])
  const raw = scValToNative(retval) as Record<string, bigint | number>
  const units = (key: string) => Number(raw[key] ?? 0) / SCALE
  return {
    shares: units('shares'),
    usdcValue: units('usdc_value'),
    claimableYield: units('claimable_yield'),
    shareOfPoolBps: Number(raw.share_of_pool_bps ?? 0),
    totalDeposited: units('total_deposited'),
  }
}

/**
 * Read claimable_yield(account) — unclaimed yield in USDC for an account.
 * Returns 0 when NEXT_PUBLIC_VAULT_CONTRACT_ID is not set; throws on read errors.
 */
export async function fetchClaimableYield(
  account: string,
  network = STELLAR_NETWORK,
): Promise<number> {
  if (!CONTRACT_ID) return 0
  const { Address, scValToNative } = await import('@stellar/stellar-sdk')
  try {
    const retval = await sorobanSimulate(
      account,
      'claimable_yield',
      [new Address(account).toScVal()],
      network,
    )
    return Number(scValToNative(retval)) / SCALE
  } catch (e) {
    if (isTransportError(e)) setOffline(true)
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/**
 * Read the connected wallet's on-chain USDC token balance from the USDC SAC contract.
 * Simulates balance(id) on the SAC and scales from i128 stroops (10^7 decimals).
 * Throws when NEXT_PUBLIC_USDC_SAC_ID is not set or when simulation fails.
 */
export async function fetchUsdcBalance(
  address: string,
  network = STELLAR_NETWORK,
): Promise<number> {
  const usdcSacId = process.env.NEXT_PUBLIC_USDC_SAC_ID || USDC_SAC_ID
  if (!usdcSacId) throw new Error('NEXT_PUBLIC_USDC_SAC_ID not set')
  const { Address, scValToNative } = await import('@stellar/stellar-sdk')
  try {
    const retval = await sorobanSimulate(
      address,
      'balance',
      [new Address(address).toScVal()],
      network,
      usdcSacId,
    )
    return Number(scValToNative(retval)) / SCALE
  } catch (e) {
    if (isTransportError(e)) setOffline(true)
    throw e instanceof Error ? e : new Error(String(e))
  }
}

// ---------------------------------------------------------------------------
// Transaction helpers
// ---------------------------------------------------------------------------

/** Seconds to poll getTransaction before giving up */
const TX_POLL_TIMEOUT_S = 30

export interface TransactionConfirmation {
  status: string
  returnValue?: unknown
  events?: { contractEventsXdr?: unknown[] }
}

function decodeWithdrawConfirmation(
  confirmation: TransactionConfirmation,
  shares: bigint,
  xdr: typeof import('@stellar/stellar-sdk').xdr,
  scValToNative: typeof import('@stellar/stellar-sdk').scValToNative,
): { queued: boolean; estimatedAmount?: number } {
  let returned: unknown
  try {
    const rawReturn = confirmation.returnValue
    returned =
      typeof rawReturn === 'bigint' || typeof rawReturn === 'number'
        ? rawReturn
        : rawReturn == null
          ? undefined
          : scValToNative(rawReturn as Parameters<typeof scValToNative>[0])
  } catch {
    returned = undefined
  }

  const queued = shares > 0n && (returned === 0n || returned === 0)
  let estimatedAmount =
    (typeof returned === 'bigint' && returned > 0n) ||
    (typeof returned === 'number' && returned > 0)
      ? Number(returned) / SCALE
      : undefined

  for (const rawEvent of confirmation.events?.contractEventsXdr ?? []) {
    try {
      const event =
        typeof rawEvent === 'string'
          ? xdr.ContractEvent.fromXDR(rawEvent, 'base64')
          : (rawEvent as InstanceType<typeof xdr.ContractEvent>)
      const eventV0 = event.body().v0()
      const isWithdrawQueued = eventV0.topics().some((topic) => {
        try {
          return scValToNative(topic) === 'withdraw_queued'
        } catch {
          return false
        }
      })
      if (!isWithdrawQueued) continue

      const data = scValToNative(eventV0.data())
      const owed =
        data instanceof Map
          ? data.get('usdc_owed')
          : data && typeof data === 'object'
            ? (data as Record<string, unknown>).usdc_owed
            : undefined
      if (typeof owed === 'bigint' || typeof owed === 'number') {
        estimatedAmount = Number(owed) / SCALE
      }
    } catch {
      // Ignore malformed or unrelated events in the RPC response.
    }
  }

  return { queued, estimatedAmount }
}

class TransactionFailedError extends Error {}

function extractContractError(result: unknown): string {
  let foundCode: string | undefined
  function walk(obj: unknown) {
    if (foundCode || !obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item)
      return
    }
    const rec = obj as Record<string, unknown>
    const sw = rec._switch
    if (sw && typeof sw === 'object' && (sw as Record<string, unknown>).name === 'sceContract') {
      const val = rec._value
      if (typeof val === 'number') {
        foundCode = val.toString()
        return
      }
    }
    for (const value of Object.values(rec)) walk(value)
  }
  walk(result)
  return foundCode ? `Error(Contract, #${foundCode})` : ''
}

/** Poll until a submitted transaction reaches a terminal status. */
async function waitForTransaction(hash: string): Promise<TransactionConfirmation> {
  const { rpc } = await import('@stellar/stellar-sdk')
  const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
  const deadline = Date.now() + TX_POLL_TIMEOUT_S * 1000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const result = await withTimeout(
      server.getTransaction(hash),
      'Stellar RPC timed out while polling transaction status',
    )
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return result as unknown as TransactionConfirmation
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      const contractErr = extractContractError(result)
      throw new TransactionFailedError(
        `Transaction failed on-chain${contractErr ? `: ${contractErr}` : ''}`,
      )
    }
    // NOT_FOUND means still pending, keep polling
  }
  throw new TransactionPendingError(hash)
}

/**
 * Build a contract call from `address`, simulate it, have the wallet sign it,
 * submit it and wait for confirmation. Shared by every signed vault action.
 */
async function invokeSigned(
  address: string,
  method: string,
  args: XdrTypes.ScVal[],
  sign: (xdr: string) => Promise<string>,
  amount?: number,
  memo?: string,
): Promise<{ hash: string; confirmation: TransactionConfirmation }> {
  const { rpc, Contract, TransactionBuilder, Horizon, Transaction, Memo } =
    await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
  const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: allowHttpFor(HORIZON_URL) })
  const contract = new Contract(CONTRACT_ID!)

  const [account, baseFee] = await Promise.all([
    withTimeout(horizon.loadAccount(address), 'Stellar Horizon timed out loading account'),
    horizon.fetchBaseFee().catch(() => 100),
  ])

  const txBuilder = new TransactionBuilder(account, {
    fee: baseFee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(180)
  if (memo?.trim()) txBuilder.addMemo(Memo.text(memo.trim()))
  const tx = txBuilder.build()

  const simResult = await withTimeout(
    server.simulateTransaction(tx),
    'Stellar RPC timed out during simulation',
  )
  if ('error' in simResult) throw new Error(`Simulation failed: ${simResult.error}`)

  const assembled = rpc.assembleTransaction(tx, simResult).build()
  const signedXdr = await sign(assembled.toXDR())
  const signedTx = new Transaction(signedXdr, NETWORK_PASSPHRASE)

  const localHash = signedTx.hash().toString('hex')
  const fee = Number(assembled.fee) / SCALE
  const ext = assembled.toEnvelope().v1().tx().ext()
  const resourceFee =
    ext.switch() === 1 ? Number(ext.sorobanData().resourceFee().toString()) / SCALE : 0
  recordTransaction({
    hash: localHash,
    kind: method,
    amount,
    address,
    status: 'pending',
    fee,
    resourceFee,
    inclusionFee: Math.max(0, fee - resourceFee),
  })
  let hash = localHash
  try {
    let sendResult
    let retries = 0
    const MAX_RETRIES = 5
    while (true) {
      sendResult = await withTimeout(
        server.sendTransaction(signedTx),
        'Stellar RPC timed out submitting transaction',
      )
      if (sendResult.status === 'TRY_AGAIN_LATER') {
        if (retries < MAX_RETRIES) {
          retries++
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries - 1)))
          continue
        }
        throw new TransactionFailedError('Send failed: TRY_AGAIN_LATER')
      }
      break
    }

    if (sendResult.status === 'ERROR') {
      const contractErr = extractContractError(sendResult)
      const msg = contractErr
        ? contractErr
        : JSON.stringify(sendResult.errorResult ?? 'unknown', (_, v) =>
            typeof v === 'bigint' ? v.toString() : v,
          )
      throw new TransactionFailedError(`Send failed: ${msg}`)
    }

    // DUPLICATE and PENDING fall through to polling.
    // The RPC hash should equal the hash computed from the signed envelope.
    if (sendResult.hash && sendResult.hash !== localHash) {
      throw new TransactionPendingError(localHash)
    }
    hash = sendResult.hash || localHash
    const confirmation = await waitForTransaction(hash)
    updateTransaction(hash, 'confirmed', { error: undefined })
    return { hash, confirmation }
  } catch (error) {
    if (error instanceof TransactionFailedError) {
      updateTransaction(hash, 'failed', { error: error.message })
      throw error
    }
    updateTransaction(hash, 'timeout_pending', { error: undefined })
    throw new TransactionPendingError(hash)
  }
}

/**
 * Estimate the real Soroban resource fee for a deposit or withdraw transaction via simulation.
 * Returns an estimated maximum network fee in XLM, or null when unavailable.
 */
export async function estimateTransactionFee(
  kind: 'deposit' | 'withdraw',
  amount: number,
  address: string,
  slippageTolerance = 0.005,
): Promise<number | null> {
  if (!CONTRACT_ID || offline || !address) {
    return null
  }

  try {
    const { rpc, Contract, TransactionBuilder, Horizon, nativeToScVal } =
      await import('@stellar/stellar-sdk')

    const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
    const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: allowHttpFor(HORIZON_URL) })
    const contract = new Contract(CONTRACT_ID)

    const [account, baseFee] = await Promise.all([
      withTimeout(horizon.loadAccount(address), 'Stellar Horizon timed out loading account'),
      horizon.fetchBaseFee().catch(() => 100),
    ])

    let args: XdrTypes.ScVal[] = []
    if (kind === 'deposit') {
      const minShares = Math.floor((amount / cachedSharePrice) * (1 - slippageTolerance) * SCALE)
      args = [
        nativeToScVal(toStroops(amount), { type: 'i128' }),
        nativeToScVal(BigInt(minShares), { type: 'i128' }),
      ]
    } else {
      const shares = Math.round((amount / cachedSharePrice) * SCALE)
      const minUsdcReturn = Math.floor(amount * (1 - slippageTolerance) * SCALE)
      args = [
        nativeToScVal(BigInt(shares), { type: 'i128' }),
        nativeToScVal(BigInt(minUsdcReturn), { type: 'i128' }),
      ]
    }

    const tx = new TransactionBuilder(account, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(kind, ...args))
      .setTimeout(180)
      .build()

    const simResult = await withTimeout(
      server.simulateTransaction(tx),
      'Stellar RPC timed out during simulation',
    )

    if ('error' in simResult) return null

    const assembled = rpc.assembleTransaction(tx, simResult).build()
    const feeInUnits = Number(assembled.fee) / SCALE
    return feeInUnits > 0 ? feeInUnits : null
  } catch {
    return null
  }
}

/**
 * Check single transaction status on-chain.
 */
export async function checkTransactionOnChain(
  hash: string,
): Promise<'confirmed' | 'failed' | 'pending'> {
  if (!CONTRACT_ID || hash.startsWith('demo')) {
    return 'confirmed'
  }
  try {
    const { rpc } = await import('@stellar/stellar-sdk')
    const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
    const result = await server.getTransaction(hash)
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return 'confirmed'
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      return 'failed'
    }
    return 'pending'
  } catch {
    return 'pending'
  }
}

/** Reject an over-long or malformed text memo before anything is sent (#575). */
function assertValidMemo(memo: string | undefined): void {
  if (memo === undefined || memo === '') return
  const result = validateMemo(memo, 'text')
  if (!result.valid) throw new Error(result.error || 'Memo is too long (maximum 28 bytes)')
}

/**
 * Build, sign, and submit a deposit transaction.
 * In demo mode (CONTRACT_ID not set): waits 2 s then returns a placeholder hash.
 *
 * @param amount  USDC amount (integer stroops internally)
 * @param address Stellar address of the depositor (source account)
 * @param sign    Signing function from WalletProvider
 * @param slippageTolerance  Slippage tolerance as decimal (e.g., 0.005 = 0.5%)
 * @param memo    Optional Stellar text memo (max 28 bytes)
 * @returns       Transaction hash (real or placeholder)
 */
export async function submitDeposit(
  amount: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
  signal?: AbortSignal,
  slippageTolerance = 0.005,
  memo?: string,
): Promise<string> {
  assertValidMemo(memo)
  if (!CONTRACT_ID) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const demoHash = `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`
        recordTransaction({ hash: demoHash, kind: 'deposit', status: 'confirmed', amount })
        notifyTransactionConfirmed(demoHash, 'deposit')
        resolve(demoHash)
      }, SIMULATED_DEPOSIT_DELAY_MS)
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        })
        if (signal.aborted) {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        }
      }
    })
  }

  const { nativeToScVal } = await import('@stellar/stellar-sdk')
  const minShares = Math.floor((amount / cachedSharePrice) * (1 - slippageTolerance) * SCALE)
  const { hash } = await invokeSigned(
    address,
    'deposit',
    [
      nativeToScVal(toStroops(amount), { type: 'i128' }),
      nativeToScVal(BigInt(minShares), { type: 'i128' }),
    ],
    sign,
    amount,
    memo,
  )
  notifyTransactionConfirmed(hash, 'deposit')
  return hash
}

/**
 * Validates and submits a direct Stellar payment transaction with memo validation.
 * Rejects up-front before sending if the memo length or payment parameters are invalid.
 */
export async function submitPayment(
  amount: number,
  destination: string,
  sourceAddress: string,
  sign: (xdr: string) => Promise<string>,
  options?: {
    memo?: string
    memoType?: StellarMemoType
    signal?: AbortSignal
  },
): Promise<string> {
  const validation = validateStellarPayment({
    amount,
    destination,
    memo: options?.memo,
    memoType: options?.memoType ?? 'text',
  })

  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0]
    throw new Error(firstError || 'Invalid payment parameters')
  }

  if (!CONTRACT_ID) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(
          `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`,
        )
      }, SIMULATED_DEPOSIT_DELAY_MS)
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        })
        if (options.signal.aborted) {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        }
      }
    })
  }

  if (offline) throw new Error('Stellar node is offline')

  const { Horizon, TransactionBuilder, Operation, Asset, Transaction, Memo } =
    await import('@stellar/stellar-sdk')

  const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: allowHttpFor(HORIZON_URL) })

  const account = await withTimeout(
    horizon.loadAccount(sourceAddress),
    'Stellar Horizon timed out loading account',
  )

  const txBuilder = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: amount.toFixed(7),
      }),
    )
    .setTimeout(180)

  if (options?.memo && options.memo.trim()) {
    txBuilder.addMemo(Memo.text(options.memo.trim()))
  }

  const tx = txBuilder.build()
  const signedXdr = await sign(tx.toXDR())
  const signedTx = new Transaction(signedXdr, NETWORK_PASSPHRASE)

  const sendResult = await withTimeout(
    horizon.submitTransaction(signedTx),
    'Stellar Horizon timed out submitting transaction',
  )

  return sendResult.hash
}

/**
 * Build, sign, and submit a withdraw transaction.
 * Reads events after confirmation to detect queued withdrawals (WithdrawQueued).
 * In demo mode (CONTRACT_ID not set): returns a WithdrawResult with demo hash.
 * If amount exceeds liquid share (236), enqueues the withdrawal.
 *
 * @param amount  USDC amount to withdraw
 * @param address Stellar address of the withdrawer
 * @param sign    Signing function from WalletProvider
 * @param slippageTolerance  Slippage tolerance as decimal (e.g., 0.005 = 0.5%)
 * @returns       WithdrawResult with hash and queued status
 */
export async function submitWithdraw(
  amount: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
  signal?: AbortSignal,
  slippageTolerance = 0.005,
  memo?: string,
): Promise<WithdrawResult> {
  assertValidMemo(memo)
  if (!CONTRACT_ID) {
    return new Promise<WithdrawResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const demoHash = `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`
        const isQueued = amount > 236
        recordTransaction({ hash: demoHash, kind: 'withdraw', status: 'confirmed', amount })
        notifyTransactionConfirmed(demoHash, 'withdraw')
        resolve(createWithdrawResult(demoHash, isQueued, amount))
      }, SIMULATED_WITHDRAW_DELAY_MS)
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        })
        if (signal.aborted) {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        }
      }
    })
  }

  const { nativeToScVal, xdr, scValToNative } = await import('@stellar/stellar-sdk')

  const [priceStr, portfolio] = await Promise.all([
    fetchSharePrice(address),
    fetchPortfolio(address),
  ])

  const livePrice = Number(priceStr)
  if (!livePrice || isNaN(livePrice)) {
    throw new Error('No live share price available')
  }

  let shares = Math.floor((amount / livePrice) * SCALE)
  const maxShares = Math.floor(portfolio.shares * SCALE)

  if (shares >= maxShares) {
    shares = maxShares
    // Recalculate amount based on the exact shares being burned so minUsdcReturn calculation matches
    amount = (shares / SCALE) * livePrice
  }

  const minUsdcReturn = Math.floor(amount * (1 - slippageTolerance) * SCALE)
  const { hash, confirmation: conf } = await invokeSigned(
    address,
    'withdraw',
    [
      nativeToScVal(BigInt(shares), { type: 'i128' }),
      nativeToScVal(BigInt(minUsdcReturn), { type: 'i128' }),
    ],
    sign,
    amount,
    memo,
  )
  const { queued, estimatedAmount } = decodeWithdrawConfirmation(
    conf,
    BigInt(shares),
    xdr,
    scValToNative,
  )
  const result = createWithdrawResult(hash, queued, estimatedAmount)
  notifyTransactionConfirmed(hash, 'withdraw')
  return result
}

/**
 * Call permissionless claim() on the InvestmentVault to pay out queued withdrawals.
 */
export async function submitClaim(
  address: string,
  sign: (xdr: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<string> {
  if (!CONTRACT_ID) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const demoHash = `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`
        recordTransaction({ hash: demoHash, kind: 'claim', status: 'confirmed' })
        notifyTransactionConfirmed(demoHash, 'claim')
        resolve(demoHash)
      }, 1500)
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        })
        if (signal.aborted) {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        }
      }
    })
  }

  // claim() is permissionless and takes no arguments; it pays queued
  // withdrawals in FIFO order to their owners.
  const { hash } = await invokeSigned(address, 'claim', [], sign)
  notifyTransactionConfirmed(hash, 'claim')
  return hash
}

/**
 * Claim accumulated yield: claim_yield(from). Pays the connected wallet's
 * claimable USDC yield. In demo mode waits briefly and returns a placeholder hash.
 */
export async function submitClaimYield(
  address: string,
  sign: (xdr: string) => Promise<string>,
): Promise<string> {
  if (!CONTRACT_ID) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const demoHash = `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`
    recordTransaction({ hash: demoHash, kind: 'claim_yield', status: 'confirmed' })
    notifyTransactionConfirmed(demoHash, 'claim_yield')
    return demoHash
  }
  const { Address } = await import('@stellar/stellar-sdk')
  const { hash } = await invokeSigned(
    address,
    'claim_yield',
    [new Address(address).toScVal()],
    sign,
  )
  notifyTransactionConfirmed(hash, 'claim_yield')
  return hash
}
