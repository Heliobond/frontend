/**
 * Admin and Oracle client for privileged InvestmentVault and ProjectRegistry transactions.
 * Handles route gating via on-chain contract owner / admin checks,
 * live contract reads, and signed admin transactions with multisig support.
 */

import { STELLAR_NETWORK, SOROBAN_RPC_URL as RPC_URL, HORIZON_URL } from '../config/network'
import { Address, nativeToScVal, type xdr } from '@stellar/stellar-sdk'

const VAULT_CONTRACT_ID = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
const REGISTRY_CONTRACT_ID = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID
const CONFIGURED_ADMIN_ADDR = process.env.NEXT_PUBLIC_ADMIN_ADDRESS

export const DEMO_ADMIN_ADDRESS = 'GBQHWXVZ2K4M6N8P3R5T7W9YA2C4E6G8J3L5Q7S9U2X4Z6B8D1F3H59XQ'

const TX_POLL_TIMEOUT_S = 30
const SIMULATED_DELAY_MS = 1500

export interface AdminTxResult {
  hash: string
  approvalCount?: number
}

async function withTimeout<T>(promise: Promise<T>, message: string, ms = 5000): Promise<T> {
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

async function waitForTx(hash: string): Promise<void> {
  const { rpc } = await import('@stellar/stellar-sdk')
  const server = new rpc.Server(RPC_URL, { allowHttp: false })
  const deadline = Date.now() + TX_POLL_TIMEOUT_S * 1000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const result = await withTimeout(
      server.getTransaction(hash),
      'Stellar RPC timed out while polling transaction status',
    )
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error('Admin transaction failed on-chain')
    }
  }
  throw new Error('Admin transaction confirmation timed out')
}

/** Check if connected address is an authorized administrator */
export async function checkIsAdmin(address: string | null): Promise<boolean> {
  if (!address) return false

  const configuredList = (CONFIGURED_ADMIN_ADDR || '')
    .split(',')
    .map((a) => a.trim().toUpperCase())
    .filter(Boolean)

  if (configuredList.includes(address.toUpperCase())) {
    return true
  }

  const contractId = VAULT_CONTRACT_ID || REGISTRY_CONTRACT_ID
  if (!contractId) {
    return address.toUpperCase() === DEMO_ADMIN_ADDRESS.toUpperCase()
  }

  try {
    const { rpc, Contract, TransactionBuilder, Networks, Account, scValToNative } =
      await import('@stellar/stellar-sdk')

    const server = new rpc.Server(RPC_URL, { allowHttp: false })
    const contract = new Contract(contractId)
    const source = new Account(address, '0')
    const networkPassphrase = STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET

    for (const method of ['admin', 'owner', 'get_admin']) {
      try {
        const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase })
          .addOperation(contract.call(method))
          .setTimeout(0)
          .build()

        const simResult = await withTimeout(
          server.simulateTransaction(tx),
          'Simulate timed out',
          3000,
        )
        if ('result' in simResult && simResult.result?.retval) {
          const owner = scValToNative(simResult.result.retval)
          if (typeof owner === 'string' && owner.toUpperCase() === address.toUpperCase()) {
            return true
          }
        }
      } catch {
        /* try next method */
      }
    }

    // Check parameterized is_admin(address)
    try {
      const { Address } = await import('@stellar/stellar-sdk')
      const userScVal = new Address(address).toScVal()
      const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase })
        .addOperation(contract.call('is_admin', userScVal))
        .setTimeout(0)
        .build()

      const simResult = await withTimeout(
        server.simulateTransaction(tx),
        'Simulate timed out',
        3000,
      )
      if ('result' in simResult && simResult.result?.retval) {
        const res = scValToNative(simResult.result.retval)
        if (Boolean(res)) return true
      }
    } catch {
      /* ignore */
    }
  } catch {
    /* fallback to configured addresses */
  }

  return configuredList.includes(address.toUpperCase())
}

export interface MultisigConfig {
  signers: string[]
  threshold: number
  isMultisig: boolean
}

/** Fetch multisig configuration (signers and threshold) for contract */
export async function getMultisigConfig(
  contractId?: string,
  address: string = DEMO_ADMIN_ADDRESS,
): Promise<MultisigConfig> {
  const targetId = contractId || VAULT_CONTRACT_ID || REGISTRY_CONTRACT_ID
  if (!targetId || !address) return { signers: [], threshold: 0, isMultisig: false }

  try {
    const { rpc, Contract, TransactionBuilder, Networks, Account, scValToNative } =
      await import('@stellar/stellar-sdk')
    const server = new rpc.Server(RPC_URL, { allowHttp: false })
    const contract = new Contract(targetId)
    const source = new Account(address, '0')
    const networkPassphrase = STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET

    const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase })
      .addOperation(contract.call('get_multisig_admin'))
      .setTimeout(0)
      .build()

    const sim = await withTimeout(server.simulateTransaction(tx), 'Simulate timed out', 3000)
    if ('result' in sim && sim.result?.retval) {
      const native = scValToNative(sim.result.retval)
      if (Array.isArray(native) && native.length >= 2) {
        const signers = Array.isArray(native[0]) ? native[0].map(String) : []
        const threshold = Number(native[1]) || 0
        return { signers, threshold, isMultisig: threshold > 0 }
      }
    }
  } catch {
    return { signers: [], threshold: 0, isMultisig: false }
  }
  return { signers: [], threshold: 0, isMultisig: false }
}

/** Check if contract deployment uses multisig */
export async function isMultisigDeployment(
  address?: string,
  contractId?: string,
): Promise<boolean> {
  const config = await getMultisigConfig(contractId, address)
  return config.isMultisig
}

async function sendContractTx(
  contractId: string,
  method: string,
  args: unknown[],
  address: string,
  sign: (xdr: string) => Promise<string>,
): Promise<string> {
  const {
    rpc,
    Contract,
    TransactionBuilder,
    Networks,
    Horizon,
    Transaction,
    nativeToScVal,
    Address,
  } = await import('@stellar/stellar-sdk')

  const server = new rpc.Server(RPC_URL, { allowHttp: false })
  const horizon = new Horizon.Server(HORIZON_URL)
  const contract = new Contract(contractId)

  const account = await withTimeout(
    horizon.loadAccount(address),
    'Stellar Horizon timed out loading account',
  )
  const networkPassphrase = STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET

  const scArgs = args.map((a) => {
    if (a && typeof a === 'object' && typeof (a as { switch?: unknown }).switch === 'function') {
      return a as xdr.ScVal
    }
    if (typeof a === 'string' && a.startsWith('G') && a.length === 56) {
      try {
        return new Address(a).toScVal()
      } catch {
        return nativeToScVal(a)
      }
    }
    return nativeToScVal(a)
  })

  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(180)
    .build()

  const simResult = await withTimeout(server.simulateTransaction(tx), 'Simulation timed out')
  if ('error' in simResult) throw new Error(`Simulation failed: ${simResult.error}`)

  const assembled = rpc.assembleTransaction(tx, simResult).build()
  const signedXdr = await sign(assembled.toXDR())
  const signedTx = new Transaction(signedXdr, networkPassphrase)

  const sendResult = await withTimeout(
    server.sendTransaction(signedTx),
    'Transaction submit timed out',
  )
  if (sendResult.status === 'ERROR') {
    throw new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`)
  }

  await waitForTx(sendResult.hash)
  return sendResult.hash
}

function simulateDemoTx(): Promise<string> {
  return new Promise<string>((resolve) => {
    setTimeout(() => {
      resolve(
        `demo${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}…${Math.random().toString(36).slice(2, 8)}`,
      )
    }, SIMULATED_DELAY_MS)
  })
}

export function buildFundProjectCall(
  projectId: number,
  scaledAmount: bigint,
  approvals: string[] = [],
): { method: string; args: any[] } {
  const isMultisig = approvals.length > 0
  const method = isMultisig ? 'fund_project_with_approvals' : 'fund_project'
  const args: any[] = [
    nativeToScVal(projectId, { type: 'u32' }),
    nativeToScVal(scaledAmount, { type: 'i128' }),
  ]
  if (isMultisig) {
    args.push(nativeToScVal(approvals.map((a) => new Address(a))))
  }
  return { method, args }
}

export function buildUpdateScoresCall(
  projectId: number,
  credit: number,
  green: number,
  approvals: string[] = [],
): { method: string; args: any[] } {
  const isMultisig = approvals.length > 0
  const method = isMultisig ? 'update_impact_score_approved' : 'update_impact_score'
  const args: any[] = [
    nativeToScVal(projectId, { type: 'u32' }),
    nativeToScVal(credit, { type: 'u32' }),
    nativeToScVal(green, { type: 'u32' }),
  ]
  if (isMultisig) {
    args.push(nativeToScVal(approvals.map((a) => new Address(a))))
  }
  return { method, args }
}

/** Execute fund_project on InvestmentVault */
export async function submitFundProject(
  projectId: number,
  amount: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
  approvals: boolean | string[] = [],
): Promise<AdminTxResult> {
  const approverAddrs = Array.isArray(approvals) ? approvals : []
  const isMultisig = Array.isArray(approvals) ? approvals.length > 0 : Boolean(approvals)
  if (!VAULT_CONTRACT_ID) {
    const hash = await simulateDemoTx()
    return { hash, approvalCount: isMultisig ? approverAddrs.length || 1 : undefined }
  }

  const scaledAmount = BigInt(Math.round(amount * 1e7))
  const { method, args } = buildFundProjectCall(projectId, scaledAmount, approverAddrs)
  const hash = await sendContractTx(VAULT_CONTRACT_ID, method, args, address, sign)
  return { hash, approvalCount: isMultisig ? approverAddrs.length || 1 : undefined }
}

/** Execute update_impact_score on ProjectRegistry / InvestmentVault */
export async function submitUpdateScores(
  projectId: number,
  credit: number,
  green: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
  approvals: boolean | string[] = [],
): Promise<AdminTxResult> {
  const approverAddrs = Array.isArray(approvals) ? approvals : []
  const isMultisig = Array.isArray(approvals) ? approvals.length > 0 : Boolean(approvals)
  const targetContract = REGISTRY_CONTRACT_ID || VAULT_CONTRACT_ID
  if (!targetContract) {
    const hash = await simulateDemoTx()
    return { hash, approvalCount: isMultisig ? approverAddrs.length || 1 : undefined }
  }

  const { method, args } = buildUpdateScoresCall(projectId, credit, green, approverAddrs)
  const hash = await sendContractTx(targetContract, method, args, address, sign)
  return { hash, approvalCount: isMultisig ? approverAddrs.length || 1 : undefined }
}

/** Execute set_whitelist on ProjectRegistry */
export async function submitSetWhitelist(
  creatorAddress: string,
  approved: boolean,
  address: string,
  sign: (xdr: string) => Promise<string>,
  _isMultisig = false,
): Promise<AdminTxResult> {
  const targetContract = REGISTRY_CONTRACT_ID || VAULT_CONTRACT_ID
  if (!targetContract) {
    const hash = await simulateDemoTx()
    return { hash }
  }

  const method = 'set_whitelist'
  const hash = await sendContractTx(
    targetContract,
    method,
    [new Address(creatorAddress).toScVal(), nativeToScVal(approved)],
    address,
    sign,
  )
  return { hash }
}

/** Execute pause on InvestmentVault */
export async function submitPause(
  paused: boolean,
  address: string,
  sign: (xdr: string) => Promise<string>,
): Promise<AdminTxResult> {
  if (!VAULT_CONTRACT_ID) {
    const hash = await simulateDemoTx()
    return { hash }
  }

  const method = paused ? 'pause' : 'unpause'
  const hash = await sendContractTx(VAULT_CONTRACT_ID, method, [], address, sign)
  return { hash }
}
