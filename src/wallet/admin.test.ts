import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rpc, nativeToScVal, Address, type Transaction, type xdr } from '@stellar/stellar-sdk'
import { checkIsAdmin, getAdminRoles, type AdminRoles } from './admin'

describe('On-chain admin and role checks (Issue #690)', () => {
  const VAULT_ADDR = 'CCWG4L5IJ5Y36YBGKLUGMPLL6RXJUSRIXP67EV3VFHPAZZO56CJJTQYD'
  const REGISTRY_ADDR = 'CBE75HS6PXI3C7LMUINZZNN2B3JAQ3ETOUOQT4H7XTEL5NCRJW4Z33BY'

  const OWNER_ADDR = 'GCVIMAOPBRGVPOO7BSEO5OAAQ7S3CFPZSBZVCJALT4R6Q2WB473X5RQL'
  const WHITELISTER_ADDR = 'GAMWDPHBEIUFOHQ3HOPBZS4QNFG7VCIKKGWRF3SLFLN6S5OQ3KIMJROH'
  const NON_ADMIN_ADDR = 'GBJVMAZ7KECYYVGCT5BUYPF2XPHSUSUVY7YQORK7ND5Z5TAQIBPM43DD'

  type TxWithOp = Transaction & {
    operations: Array<{
      func: {
        invokeContract: () => {
          functionName: () => { toString: () => string }
          contractAddress: () => xdr.ScAddress
        }
      }
    }>
  }

  function getFunctionName(tx: unknown): string | null {
    try {
      const op = (tx as TxWithOp).operations[0]
      return op.func.invokeContract().functionName().toString()
    } catch {
      return null
    }
  }

  function makeSimResponse(retval: xdr.ScVal | null): rpc.Api.SimulateTransactionResponse {
    return {
      result: { retval: retval ?? undefined },
    } as unknown as rpc.Api.SimulateTransactionResponse
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS
    process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID = VAULT_ADDR
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = REGISTRY_ADDR
  })

  it('makes no calls to admin, owner, get_admin, or is_admin', async () => {
    const simulatedMethods: string[] = []

    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(async (tx) => {
      const fn = getFunctionName(tx)
      if (fn) simulatedMethods.push(fn)
      return makeSimResponse(null)
    })

    await getAdminRoles(NON_ADMIN_ADDR)

    expect(simulatedMethods).not.toContain('admin')
    expect(simulatedMethods).not.toContain('owner')
    expect(simulatedMethods).not.toContain('get_admin')
    expect(simulatedMethods).not.toContain('is_admin')
    expect(simulatedMethods).toContain('get_owner')
    expect(simulatedMethods).toContain('get_whitelister')
  })

  it('grants admin access to vault get_owner() when NEXT_PUBLIC_ADMIN_ADDRESS is unset', async () => {
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(async (tx) => {
      const fn = getFunctionName(tx)
      if (fn === 'get_owner') {
        const op = (tx as TxWithOp).operations[0]
        const scAddr = op.func.invokeContract().contractAddress()
        const contractId = Address.fromScAddress(scAddr).toString()
        if (contractId === VAULT_ADDR) {
          return makeSimResponse(nativeToScVal(OWNER_ADDR, { type: 'address' }))
        }
      }
      return makeSimResponse(null)
    })

    const roles: AdminRoles = await getAdminRoles(OWNER_ADDR)
    expect(roles.isVaultOwner).toBe(true)
    expect(roles.isAdmin).toBe(true)

    const isAdmin = await checkIsAdmin(OWNER_ADDR)
    expect(isAdmin).toBe(true)
  })

  it('grants admin access to whitelister even when not an owner', async () => {
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(async (tx) => {
      const fn = getFunctionName(tx)
      if (fn === 'get_whitelister') {
        return makeSimResponse(nativeToScVal(WHITELISTER_ADDR, { type: 'address' }))
      }
      return makeSimResponse(null)
    })

    const roles = await getAdminRoles(WHITELISTER_ADDR)
    expect(roles.isVaultOwner).toBe(false)
    expect(roles.isWhitelister).toBe(true)
    expect(roles.isAdmin).toBe(true)

    const isAdmin = await checkIsAdmin(WHITELISTER_ADDR)
    expect(isAdmin).toBe(true)
  })

  it('denies access to non-admin wallets when RPC returns different owners', async () => {
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(async (tx) => {
      const fn = getFunctionName(tx)
      if (fn === 'get_owner') {
        return makeSimResponse(nativeToScVal(OWNER_ADDR, { type: 'address' }))
      }
      return makeSimResponse(null)
    })

    const roles = await getAdminRoles(NON_ADMIN_ADDR)
    expect(roles.isVaultOwner).toBe(false)
    expect(roles.isRegistryOwner).toBe(false)
    expect(roles.isWhitelister).toBe(false)
    expect(roles.isAdmin).toBe(false)

    const isAdmin = await checkIsAdmin(NON_ADMIN_ADDR)
    expect(isAdmin).toBe(false)
  })
})
