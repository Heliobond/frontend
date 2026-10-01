/**
 * Admin and Oracle client for privileged InvestmentVault and ProjectRegistry transactions.
 * Handles route gating via on-chain contract owner / admin checks,
 * live contract reads, and signed admin transactions with multisig support.
 */

import { STELLAR_NETWORK, SOROBAN_RPC_URL as RPC_URL, HORIZON_URL } from '../config/network'
import type { xdr } from '@stellar/stellar-sdk'

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

export interface AdminRoles {
  isVaultOwner: boolean
  isRegistryOwner: boolean
  isWhitelister: boolean
  isMultisigSigner: boolean
  isConfiguredAdmin: boolean
  isAdmin: boolean
}

async function queryMethodAddress(
  server: any,
  contractId: string,
  method: string,
  sourceAddress: string,
  networkPassphrase: string,
): Promise<string | null> {
  const { Contract, TransactionBuilder, Account, scValToNative } =
    await import('@stellar/stellar-sdk')
  try {
    const contract = new Contract(contractId)
    const source = new Account(sourceAddress, '0')
    const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase })
      .addOperation(contract.call(method))
      .setTimeout(0)
      .build()

    const simResult = (await withTimeout(
      server.simulateTransaction(tx),
      `Simulate ${method} timed out`,
      3000,
    )) as any
    if (simResult && 'result' in simResult && simResult.result?.retval) {
      const res = scValToNative(simResult.result.retval)
      if (typeof res === 'string') return res
    }
  } catch {
    /* method call failed or timed out */
  }
  return null
}

/**
 * Fetch granular administrative roles for the connected address by probing
 * get_owner on the vault and registry, and get_whitelister on the registry.
 */
export async function getAdminRoles(address: string | null): Promise<AdminRoles> {
  const emptyRoles: AdminRoles = {
    isVaultOwner: false,
    isRegistryOwner: false,
    isWhitelister: false,
    isMultisigSigner: false,
    isConfiguredAdmin: false,
    isAdmin: false,
  }

  if (!address) return emptyRoles

  const configuredAdminAddr = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? CONFIGURED_ADMIN_ADDR
  const configuredList = (configuredAdminAddr || '')
    .split(',')
    .map((a) => a.trim().toUpperCase())
    .filter(Boolean)

  const isConfiguredAdmin = configuredList.includes(address.toUpperCase())
  if (isConfiguredAdmin) {
    return {
      isVaultOwner: true,
      isRegistryOwner: true,
      isWhitelister: true,
      isMultisigSigner: true,
      isConfiguredAdmin: true,
      isAdmin: true,
    }
  }

  const vaultContractId = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID ?? VAULT_CONTRACT_ID
  const registryContractId = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ?? REGISTRY_CONTRACT_ID

  if (!vaultContractId && !registryContractId) {
    const isDemo = address.toUpperCase() === DEMO_ADMIN_ADDRESS.toUpperCase()
    return {
      isVaultOwner: isDemo,
      isRegistryOwner: isDemo,
      isWhitelister: isDemo,
      isMultisigSigner: false,
      isConfiguredAdmin: false,
      isAdmin: isDemo,
    }
  }

  try {
    const { rpc, Networks } = await import('@stellar/stellar-sdk')
    const server = new rpc.Server(RPC_URL, { allowHttp: false })
    const networkPassphrase = STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET

    // Run parallel reads in one RPC round trip
    const [vaultOwner, registryOwner, whitelister] = await Promise.all([
      vaultContractId
        ? queryMethodAddress(server, vaultContractId, 'get_owner', address, networkPassphrase)
        : Promise.resolve(null),
      registryContractId
        ? queryMethodAddress(server, registryContractId, 'get_owner', address, networkPassphrase)
        : Promise.resolve(null),
      registryContractId
        ? queryMethodAddress(
            server,
            registryContractId,
            'get_whitelister',
            address,
            networkPassphrase,
          )
        : Promise.resolve(null),
    ])

    const isVaultOwner = Boolean(vaultOwner && vaultOwner.toUpperCase() === address.toUpperCase())
    const isRegistryOwner = Boolean(
      registryOwner && registryOwner.toUpperCase() === address.toUpperCase(),
    )
    const isWhitelister = Boolean(
      whitelister && whitelister.toUpperCase() === address.toUpperCase(),
    )
    const isAdmin = isVaultOwner || isRegistryOwner || isWhitelister

    return {
      isVaultOwner,
      isRegistryOwner,
      isWhitelister,
      isMultisigSigner: false,
      isConfiguredAdmin: false,
      isAdmin,
    }
  } catch {
    return emptyRoles
  }
}

/** Check if connected address is an authorized administrator */
export async function checkIsAdmin(address: string | null): Promise<boolean> {
  const roles = await getAdminRoles(address)
  return roles.isAdmin
}

/** Check if contract deployment uses multisig */
export async function isMultisigDeployment(address?: string): Promise<boolean> {
  const contractId = VAULT_CONTRACT_ID || REGISTRY_CONTRACT_ID
  if (!contractId || !address) return false

  try {
    const { rpc, Contract, TransactionBuilder, Networks, Account, scValToNative } =
      await import('@stellar/stellar-sdk')
    const server = new rpc.Server(RPC_URL, { allowHttp: false })
    const contract = new Contract(contractId)
    const source = new Account(address, '0')
    const networkPassphrase = STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET

    const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase })
      .addOperation(contract.call('is_multisig'))
      .setTimeout(0)
      .build()

    const sim = await withTimeout(server.simulateTransaction(tx), 'Simulate timed out', 3000)
    if ('result' in sim && sim.result?.retval) {
      return Boolean(scValToNative(sim.result.retval))
    }
  } catch {
    return false
  }
  return false
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

/** Execute fund_project on InvestmentVault */
export async function submitFundProject(
  projectId: number,
  amount: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
  isMultisig = false,
): Promise<AdminTxResult> {
  if (!VAULT_CONTRACT_ID) {
    const hash = await simulateDemoTx()
    return { hash, approvalCount: isMultisig ? 1 : undefined }
  }

  const { nativeToScVal } = await import('@stellar/stellar-sdk')
  const method = isMultisig ? 'fund_project_approved' : 'fund_project'
  const scaledAmount = BigInt(Math.round(amount * 1e7))
  const hash = await sendContractTx(
    VAULT_CONTRACT_ID,
    method,
    [
      nativeToScVal(BigInt(projectId), { type: 'u64' }),
      nativeToScVal(scaledAmount, { type: 'i128' }),
    ],
    address,
    sign,
  )
  return { hash, approvalCount: isMultisig ? 1 : undefined }
}

/** Execute update_impact_score on ProjectRegistry / InvestmentVault */
export async function submitUpdateScores(
  projectId: number,
  credit: number,
  green: number,
  address: string,
  sign: (xdr: string) => Promise<string>,
  isMultisig = false,
): Promise<AdminTxResult> {
  const targetContract = REGISTRY_CONTRACT_ID || VAULT_CONTRACT_ID
  if (!targetContract) {
    const hash = await simulateDemoTx()
    return { hash, approvalCount: isMultisig ? 1 : undefined }
  }

  const { nativeToScVal } = await import('@stellar/stellar-sdk')
  const method = isMultisig ? 'update_impact_score_approved' : 'update_impact_score'
  const hash = await sendContractTx(
    targetContract,
    method,
    [
      nativeToScVal(BigInt(projectId), { type: 'u64' }),
      nativeToScVal(credit, { type: 'u32' }),
      nativeToScVal(green, { type: 'u32' }),
    ],
    address,
    sign,
  )
  return { hash, approvalCount: isMultisig ? 1 : undefined }
}

/** Execute set_whitelist on ProjectRegistry */
export async function submitSetWhitelist(
  creatorAddress: string,
  approved: boolean,
  address: string,
  sign: (xdr: string) => Promise<string>,
  isMultisig = false,
): Promise<AdminTxResult> {
  const targetContract = REGISTRY_CONTRACT_ID || VAULT_CONTRACT_ID
  if (!targetContract) {
    const hash = await simulateDemoTx()
    return { hash, approvalCount: isMultisig ? 1 : undefined }
  }

  const { nativeToScVal } = await import('@stellar/stellar-sdk')
  const method = isMultisig ? 'set_whitelist_approved' : 'set_whitelist'
  const hash = await sendContractTx(
    targetContract,
    method,
    [creatorAddress, nativeToScVal(approved)],
    address,
    sign,
  )
  return { hash, approvalCount: isMultisig ? 1 : undefined }
}

/** Execute pause on InvestmentVault */
export async function submitPause(
  paused: boolean,
  address: string,
  sign: (xdr: string) => Promise<string>,
  isMultisig = false,
): Promise<AdminTxResult> {
  if (!VAULT_CONTRACT_ID) {
    const hash = await simulateDemoTx()
    return { hash, approvalCount: isMultisig ? 1 : undefined }
  }

  const { nativeToScVal } = await import('@stellar/stellar-sdk')
  const method = isMultisig ? 'pause_approved' : 'pause'
  const hash = await sendContractTx(
    VAULT_CONTRACT_ID,
    method,
    [nativeToScVal(paused)],
    address,
    sign,
  )
  return { hash, approvalCount: isMultisig ? 1 : undefined }
}
