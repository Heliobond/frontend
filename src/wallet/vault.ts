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
} from '../config/network'
import type { xdr as XdrTypes } from '@stellar/stellar-sdk'
import { notifyTransactionConfirmed } from './vaultEvents'

/** USDC and HBS shares are i128 values with 7 decimals on-chain. */
const SCALE = 1e7

/** Convert a display amount to the contract's i128 units. */
export function toStroops(amount: number): bigint {
  return BigInt(Math.round(amount * SCALE))
}

export interface WithdrawPreview {
  assets: number
  sharePrice: number
  networkFee: number
}

export interface WithdrawResult {
  hash: string
  queued: boolean
  position?: number
  estimatedAmount?: number
  toString(): string
}

export function createWithdrawResult(
  hash: string,
  queued: boolean,
  position?: number,
  estimatedAmount?: number,
): WithdrawResult {
  return {
    hash,
    queued,
    position,
    estimatedAmount,
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
async function sorobanSimulate(
  sourceAddress: string,
  method: string,
  args: XdrTypes.ScVal[] = [],
  network: string = STELLAR_NETWORK,
): Promise<XdrTypes.ScVal> {
  const { rpc, Contract, TransactionBuilder, Account } = await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
  const contract = new Contract(CONTRACT_ID!)
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
    const error = result.error
    // Distinguish programming errors (bad address, bad args) from network errors
    // Invalid address/contract errors should NOT mark the app as offline
    const isProgrammingError =
      typeof error === 'string' &&
      (error.includes('Invalid address') ||
        error.includes('invalid address') ||
        error.includes('Malformed') ||
        error.includes('malformed') ||
        error.includes('Contract not found') ||
        error.includes('contract not found') ||
        error.includes('not a valid'))
    if (isProgrammingError) {
      throw new Error(`Soroban simulate error: ${error}`)
    }
    throw new Error(`Soroban simulate error: ${error}`)
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
  if (offline) return formatSharePrice(cachedSharePrice)
  const { scValToNative, nativeToScVal } = await import('@stellar/stellar-sdk')
  try {
    const oneShare = nativeToScVal(toStroops(1), { type: 'i128' })
    const retval = await sorobanSimulate(sourceAddress, 'convert_to_assets', [oneShare], network)
    const assetsPerShare = Number(scValToNative(retval)) / SCALE
    cachedSharePrice = assetsPerShare > 0 ? assetsPerShare : 1
    return formatSharePrice(cachedSharePrice)
  } catch (e) {
    // Don't mark offline for programming errors (invalid address, bad contract, etc.)
    const msg = e instanceof Error ? e.message : String(e)
    const isProgrammingError =
      msg.includes('Invalid address') ||
      msg.includes('invalid address') ||
      msg.includes('Malformed') ||
      msg.includes('malformed') ||
      msg.includes('Contract not found') ||
      msg.includes('contract not found') ||
      msg.includes('not a valid')
    if (!isProgrammingError) {
      setOffline(true)
    }
    return formatSharePrice(cachedSharePrice)
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
  if (offline) return cachedTotalAssets ?? 0
  const { scValToNative } = await import('@stellar/stellar-sdk')
  try {
    const retval = await sorobanSimulate(sourceAddress, 'total_assets', [], network)
    cachedTotalAssets = Number(scValToNative(retval)) / SCALE
    return cachedTotalAssets
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isProgrammingError =
      msg.includes('Invalid address') ||
      msg.includes('invalid address') ||
      msg.includes('Malformed') ||
      msg.includes('malformed') ||
      msg.includes('Contract not found') ||
      msg.includes('contract not found') ||
      msg.includes('not a valid')
    if (!isProgrammingError) {
      setOffline(true)
    }
    return cachedTotalAssets ?? 0
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
  if (offline) return 0
  const { scValToNative } = await import('@stellar/stellar-sdk')
  try {
    const retval = await sorobanSimulate(sourceAddress, 'get_utilization_bps', [], network)
    return Number(scValToNative(retval))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isProgrammingError =
      msg.includes('Invalid address') ||
      msg.includes('invalid address') ||
      msg.includes('Malformed') ||
      msg.includes('malformed') ||
      msg.includes('Contract not found') ||
      msg.includes('contract not found') ||
      msg.includes('not a valid')
    if (!isProgrammingError) {
      setOffline(true)
    }
    return 0
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

// ---------------------------------------------------------------------------
// Transaction helpers
// ---------------------------------------------------------------------------

/** Seconds to poll getTransaction before giving up */
const TX_POLL_TIMEOUT_S = 30

export interface TransactionConfirmation {
  status: string
  resultMetaXdr?: string
  returnValue?: unknown
}

class TransactionFailedError extends Error {}

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
      throw new TransactionFailedError('Transaction failed on-chain')
    }
    // NOT_FOUND means still pending, keep polling
  }
  throw new Error('Transaction confirmation timed out')
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
): Promise<{ hash: string; confirmation: TransactionConfirmation }> {
  if (offline) throw new Error('Stellar node is offline')

  const { rpc, Contract, TransactionBuilder, Horizon, Transaction } =
    await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: allowHttpFor(RPC_URL) })
  const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: allowHttpFor(HORIZON_URL) })
  const contract = new Contract(CONTRACT_ID!)

  const account = await withTimeout(
    horizon.loadAccount(address),
    'Stellar Horizon timed out loading account',
  )

  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call(method, ...args))
    .setTimeout(180)
    .build()

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
    const sendResult = await withTimeout(
      server.sendTransaction(signedTx),
      'Stellar RPC timed out submitting transaction',
    )
    if (sendResult.status === 'ERROR' || sendResult.status === 'TRY_AGAIN_LATER') {
      throw new TransactionFailedError(
        `Send failed: ${JSON.stringify(sendResult.errorResult ?? sendResult.status)}`,
      )
    }
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

    const account = await withTimeout(
      horizon.loadAccount(address),
      'Stellar Horizon timed out loading account',
    )

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
      fee: '100',
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

/**
 * Build, sign, and submit a deposit transaction.
 * In demo mode (CONTRACT_ID not set): waits 2 s then returns a placeholder hash.
 *
 * @param amount  USDC amount (integer stroops internally)
 * @param address Stellar address of the depositor (source account)
 * @param sign    Signing function from WalletProvider
 * @param slippageTolerance  Slippage tolerance as decimal (e.g., 0.005 = 0.5%)
 * @returns       Transaction hash (real or placeholder)
 */
export async function submitDeposit(
  amount: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
  signal?: AbortSignal,
  slippageTolerance = 0.005,
): Promise<string> {
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
  )
  notifyTransactionConfirmed(hash, 'deposit')
  return hash
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
): Promise<WithdrawResult> {
  if (!CONTRACT_ID) {
    return new Promise<WithdrawResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const demoHash = `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`
        const isQueued = amount > 236
        recordTransaction({ hash: demoHash, kind: 'withdraw', status: 'confirmed', amount })
        notifyTransactionConfirmed(demoHash, 'withdraw')
        resolve(createWithdrawResult(demoHash, isQueued, isQueued ? 1 : undefined, amount))
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

  const shares = Math.round((amount / cachedSharePrice) * SCALE)
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
  )
  let queued = false
  let position: number | undefined
  let estimatedAmount = amount

  const inspectEvent = (rawEvt: unknown) => {
    try {
      const anyEvt = rawEvt as {
        event?: () => unknown
        body?: () => {
          v0?: () => {
            topics?: () => unknown[]
            data?: () => unknown
          }
        }
      }
      const contractEvt = (typeof anyEvt.event === 'function' ? anyEvt.event() : anyEvt) as {
        body?: () => {
          v0?: () => {
            topics?: () => unknown[]
            data?: () => unknown
          }
        }
      }
      const body = typeof contractEvt.body === 'function' ? contractEvt.body() : undefined
      const v0 = typeof body?.v0 === 'function' ? body.v0() : undefined
      if (!v0) return

      const topics = typeof v0.topics === 'function' ? (v0.topics() ?? []) : []
      const topicStrs = topics.map((t) => {
        try {
          return String(scValToNative(t as Parameters<typeof scValToNative>[0]))
        } catch {
          return ''
        }
      })

      if (
        topicStrs.some((s) => {
          const lower = s.toLowerCase()
          return lower.includes('withdrawqueued') || lower.includes('withdraw_queued')
        })
      ) {
        queued = true
        try {
          const dataVal = typeof v0.data === 'function' ? v0.data() : undefined
          if (!dataVal) return
          const rawData = scValToNative(dataVal as Parameters<typeof scValToNative>[0])
          if (rawData && typeof rawData === 'object') {
            const record = rawData as Record<string, unknown>
            if ('position' in record) position = Number(record.position)
            if ('amount' in record) estimatedAmount = Number(record.amount) / 1e7
          } else if (typeof rawData === 'bigint' || typeof rawData === 'number') {
            position = Number(rawData)
          }
        } catch {
          /* ignore payload parse error */
        }
      }
    } catch {
      /* ignore event inspect error */
    }
  }

  const anyConf = conf as unknown as {
    resultMetaXdr?: unknown
    returnValue?: unknown
    diagnosticEventsXdr?: unknown[]
    events?: { contractEventsXdr?: unknown[][] }
  }

  // 1. Inspect contract events array from RPC response
  if (anyConf.events?.contractEventsXdr && Array.isArray(anyConf.events.contractEventsXdr)) {
    for (const group of anyConf.events.contractEventsXdr) {
      if (Array.isArray(group)) {
        for (const evt of group) inspectEvent(evt)
      }
    }
  }

  // 2. Inspect diagnostic events
  if (anyConf.diagnosticEventsXdr && Array.isArray(anyConf.diagnosticEventsXdr)) {
    for (const diag of anyConf.diagnosticEventsXdr) inspectEvent(diag)
  }

  // 3. Inspect resultMetaXdr (both parsed object and base64 string)
  if (anyConf.resultMetaXdr) {
    try {
      let meta: unknown = anyConf.resultMetaXdr
      if (typeof meta === 'string') {
        meta = xdr.TransactionMeta.fromXDR(meta, 'base64')
      }
      const typedMeta = meta as {
        v3?: () => { sorobanMeta?: () => { events?: () => unknown[] } }
        switch?: () => number
        value?: () => { sorobanMeta?: () => { events?: () => unknown[] } }
      }
      const v3 =
        typedMeta.v3?.() ||
        (typedMeta.switch?.() === 3 || typedMeta.switch?.() === 4 ? typedMeta.value?.() : null)
      const events = v3?.sorobanMeta?.()?.events?.() ?? []
      for (const evt of events) inspectEvent(evt)
    } catch {
      /* ignore meta parse error */
    }
  }

  // 4. Inspect return value if contract returns QueuedClaim struct or status
  if (anyConf.returnValue) {
    try {
      const ret = scValToNative(anyConf.returnValue as Parameters<typeof scValToNative>[0])
      if (ret && typeof ret === 'object') {
        const record = ret as Record<string, unknown>
        if ('queued' in record && Boolean(record.queued)) queued = true
        if ('position' in record) position = Number(record.position)
        if ('amount' in record) estimatedAmount = Number(record.amount) / 1e7
      }
    } catch {
      /* ignore return value parse error */
    }
  }

  const result = createWithdrawResult(
    hash,
    queued,
    position ?? (queued ? 1 : undefined),
    estimatedAmount,
  )
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
