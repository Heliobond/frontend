// InvestmentVault client — synchronous simulation + async on-chain reads.
//
// The sync `vault` object mirrors the Soroban vault's surface so deposit &
// withdraw screens can use it for immediate previews (demo / no-config mode).
//
// When NEXT_PUBLIC_VAULT_CONTRACT_ID is set, the async functions below read
// directly from the deployed Soroban contract via RPC:
//   fetchSharePrice / fetchTotalAssets  — view reads (Issue #1)
//   submitDeposit / submitWithdraw      — signed transactions (Issue #2)
//
// In demo mode (isDemo flag) or when env vars are absent, everything falls
// back gracefully — no errors surface to the user.

import { HB_DATA } from '../data'

/** total_assets / total_supply. Constant in the mock; a live read on-chain. */
export const SHARE_PRICE = HB_DATA.pool.sharePrice

export interface DepositPreview {
  shares: number
  sharePrice: number
  /** USDC; sub-cent on Stellar. */
  networkFee: number
}

export interface WithdrawPreview {
  assets: number
  sharePrice: number
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
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'
const HORIZON_URL = 'https://horizon-testnet.stellar.org'

/** Call a Soroban view function (no state mutation) and return the raw ScVal. */
async function sorobanSimulate(sourceAddress: string, method: string, args: unknown[] = []) {
  const { rpc, Contract, TransactionBuilder, Networks, Account, nativeToScVal } =
    await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: false })
  const contract = new Contract(CONTRACT_ID!)
  // Sequence '0' is fine for simulation — only the address format matters.
  const source = new Account(sourceAddress, '0')
  const scArgs = args.map((a) => nativeToScVal(a))

  const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(0)
    .build()

  const result = await server.simulateTransaction(tx)
  if ('error' in result) throw new Error(`Soroban simulate error: ${result.error}`)
  if (!result.result) throw new Error('Soroban simulate returned no result')
  return result.result.retval
}

/**
 * Read share_price from the on-chain vault.
 * Throws when NEXT_PUBLIC_VAULT_CONTRACT_ID is not set — callers should catch
 * and fall back to the mock value.
 */
export async function fetchSharePrice(sourceAddress: string): Promise<number> {
  if (!CONTRACT_ID) throw new Error('NEXT_PUBLIC_VAULT_CONTRACT_ID not set')
  const { scValToNative } = await import('@stellar/stellar-sdk')
  const retval = await sorobanSimulate(sourceAddress, 'share_price')
  return Number(scValToNative(retval))
}

/**
 * Read total_assets from the on-chain vault.
 * Throws when NEXT_PUBLIC_VAULT_CONTRACT_ID is not set.
 */
export async function fetchTotalAssets(sourceAddress: string): Promise<number> {
  if (!CONTRACT_ID) throw new Error('NEXT_PUBLIC_VAULT_CONTRACT_ID not set')
  const { scValToNative } = await import('@stellar/stellar-sdk')
  const retval = await sorobanSimulate(sourceAddress, 'total_assets')
  return Number(scValToNative(retval))
}

// ---------------------------------------------------------------------------
// Transaction helpers
// ---------------------------------------------------------------------------

/** Seconds to poll getTransaction before giving up */
const TX_POLL_TIMEOUT_S = 30

/** Poll until a submitted transaction reaches a terminal status. */
async function waitForTransaction(hash: string): Promise<void> {
  const { rpc } = await import('@stellar/stellar-sdk')
  const server = new rpc.Server(RPC_URL, { allowHttp: false })
  const deadline = Date.now() + TX_POLL_TIMEOUT_S * 1000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const result = await server.getTransaction(hash)
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error('Transaction failed on-chain')
    }
    // NOT_FOUND means still pending — keep polling
  }
  throw new Error('Transaction confirmation timed out')
}

/**
 * Build, sign, and submit a deposit transaction.
 * In demo mode (CONTRACT_ID not set): waits 2 s then returns a placeholder hash.
 *
 * @param amount  USDC amount (integer stroops internally)
 * @param address Stellar address of the depositor (source account)
 * @param sign    Signing function from WalletProvider
 * @returns       Transaction hash (real or placeholder)
 */
export async function submitDeposit(
  amount: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
): Promise<string> {
  if (!CONTRACT_ID) {
    await new Promise((r) => setTimeout(r, 2000))
    return `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`
  }

  const { rpc, Contract, TransactionBuilder, Networks, Horizon, nativeToScVal, Transaction } =
    await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: false })
  const horizon = new Horizon.Server(HORIZON_URL)
  const contract = new Contract(CONTRACT_ID)

  const account = await horizon.loadAccount(address)
  // USDC uses 7 decimal places on Stellar (stroops-equivalent for SAC tokens).
  // The contract expects the raw integer amount scaled by 10^7.
  const amountScVal = nativeToScVal(BigInt(Math.round(amount * 1e7)), { type: 'i128' })
  const minSharesScVal = nativeToScVal(BigInt(0), { type: 'i128' })

  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call('deposit', amountScVal, minSharesScVal))
    .setTimeout(180)
    .build()

  const simResult = await server.simulateTransaction(tx)
  if ('error' in simResult) throw new Error(`Simulation failed: ${simResult.error}`)

  const assembled = rpc.assembleTransaction(tx, simResult).build()
  const signedXdr = await sign(assembled.toXDR())
  const signedTx = new Transaction(signedXdr, Networks.TESTNET)

  const sendResult = await server.sendTransaction(signedTx)
  if (sendResult.status === 'ERROR')
    throw new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`)

  await waitForTransaction(sendResult.hash)
  return sendResult.hash
}

/**
 * Build, sign, and submit a withdraw transaction.
 * In demo mode (CONTRACT_ID not set): waits 2 s then returns a placeholder hash.
 *
 * @param amount  USDC amount to withdraw
 * @param address Stellar address of the withdrawer
 * @param sign    Signing function from WalletProvider
 * @returns       Transaction hash (real or placeholder)
 */
export async function submitWithdraw(
  amount: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
): Promise<string> {
  if (!CONTRACT_ID) {
    await new Promise((r) => setTimeout(r, 2000))
    return `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`
  }

  const { rpc, Contract, TransactionBuilder, Networks, Horizon, nativeToScVal, Transaction } =
    await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: false })
  const horizon = new Horizon.Server(HORIZON_URL)
  const contract = new Contract(CONTRACT_ID)

  const account = await horizon.loadAccount(address)
  const sharesScVal = nativeToScVal(BigInt(Math.round(amount * 1e7)), { type: 'i128' })
  const minAssetsScVal = nativeToScVal(BigInt(0), { type: 'i128' })

  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call('withdraw', sharesScVal, minAssetsScVal))
    .setTimeout(180)
    .build()

  const simResult = await server.simulateTransaction(tx)
  if ('error' in simResult) throw new Error(`Simulation failed: ${simResult.error}`)

  const assembled = rpc.assembleTransaction(tx, simResult).build()
  const signedXdr = await sign(assembled.toXDR())
  const signedTx = new Transaction(signedXdr, Networks.TESTNET)

  const sendResult = await server.sendTransaction(signedTx)
  if (sendResult.status === 'ERROR')
    throw new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`)

  await waitForTransaction(sendResult.hash)
  return sendResult.hash
}
