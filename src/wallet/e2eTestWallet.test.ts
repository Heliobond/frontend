import { afterEach, beforeEach, describe, expect, it } from '@/test/bun'
import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { restoreNodeGlobals } from '../../scripts/bun-test-setup'

restoreNodeGlobals()
const { E2ETestWalletModule } = await import('./e2eTestWallet')

const kp = Keypair.random()
const g = globalThis as unknown as { window?: { __HB_E2E_WALLET__?: unknown } }

describe('E2ETestWalletModule (#607)', () => {
  beforeEach(() => {
    g.window = { __HB_E2E_WALLET__: { secret: kp.secret() } }
  })
  afterEach(() => {
    delete g.window
  })

  it('is available only when a secret was injected', async () => {
    const wallet = new E2ETestWalletModule()
    await expect(wallet.isAvailable()).resolves.toBe(true)
    g.window = {}
    await expect(wallet.isAvailable()).resolves.toBe(false)
    await expect(wallet.getAddress()).rejects.toThrow('__HB_E2E_WALLET__.secret is not set')
  })

  it('exposes the keypair address and the app network by default', async () => {
    const wallet = new E2ETestWalletModule()
    await expect(wallet.getAddress()).resolves.toEqual({ address: kp.publicKey() })
    await expect(wallet.getNetwork()).resolves.toEqual({
      network: 'Testnet',
      networkPassphrase: Networks.TESTNET,
    })
  })

  it('reports an injected network so specs can exercise the mismatch guard', async () => {
    g.window = { __HB_E2E_WALLET__: { secret: kp.secret(), networkPassphrase: Networks.PUBLIC } }
    await expect(new E2ETestWalletModule().getNetwork()).resolves.toEqual({
      network: 'Mainnet',
      networkPassphrase: Networks.PUBLIC,
    })
  })

  it('signs transactions with the injected key', async () => {
    const tx = new TransactionBuilder(new Account(kp.publicKey(), '1'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.bumpSequence({ bumpTo: '5' }))
      .setTimeout(30)
      .build()

    const { signedTxXdr, signerAddress } = await new E2ETestWalletModule().signTransaction(
      tx.toXDR(),
      { networkPassphrase: Networks.TESTNET },
    )
    const signed = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
    expect(signerAddress).toBe(kp.publicKey())
    expect(signed.signatures).toHaveLength(1)
    expect(kp.verify(signed.hash(), signed.signatures[0].signature())).toBe(true)
  })

  it('does not support auth-entry or message signing', async () => {
    const wallet = new E2ETestWalletModule()
    await expect(wallet.signAuthEntry()).rejects.toThrow('not supported')
    await expect(wallet.signMessage()).rejects.toThrow('not supported')
  })
})
