import {
  Account,
  Asset,
  Operation,
  TimeoutInfinite,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'
import { NETWORK_PASSPHRASE } from '../config/network'
import {
  assertValidMessageChallenge,
  assertValidTransactionChallenge,
  MAX_MESSAGE_LENGTH,
} from './challengeGuard'

const USER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
const SERVER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const FUTURE_MAX_TIME = Math.floor(Date.now() / 1000) + 120

interface ChallengeOptions {
  sequence?: string
  operation?: 'manageData' | 'payment'
  operationSource?: string | null
  name?: string
  timebounds?: { minTime: number; maxTime: number } | null
  passphrase?: string
}

function buildChallenge(options: ChallengeOptions = {}): string {
  const account = new Account(USER, options.sequence ?? '-1')
  const builder = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: options.passphrase ?? NETWORK_PASSPHRASE,
    ...(options.timebounds === null
      ? {}
      : { timebounds: options.timebounds ?? { minTime: 0, maxTime: FUTURE_MAX_TIME } }),
  })

  if (options.timebounds === null) {
    builder.setTimeout(TimeoutInfinite)
  }

  if (options.operation === 'payment') {
    builder.addOperation(
      Operation.payment({
        destination: SERVER,
        asset: Asset.native(),
        amount: '1',
        ...(options.operationSource === null ? {} : { source: options.operationSource }),
      }),
    )
  } else {
    builder.addOperation(
      Operation.manageData({
        name: options.name ?? 'test.example auth',
        value: 'nonce',
        ...(options.operationSource === null ? {} : { source: options.operationSource ?? SERVER }),
      }),
    )
  }

  return builder.build().toXDR()
}

describe('assertValidTransactionChallenge', () => {
  it('accepts a well-formed SEP-10 challenge', async () => {
    await expect(
      assertValidTransactionChallenge(buildChallenge(), USER, NETWORK_PASSPHRASE),
    ).resolves.toBeUndefined()
  })

  it('rejects a payment transaction even with sequence 0', async () => {
    await expect(
      assertValidTransactionChallenge(buildChallenge({ operation: 'payment' }), USER),
    ).rejects.toThrow()
  })

  it('rejects a manageData challenge with a non-zero sequence number', async () => {
    await expect(
      assertValidTransactionChallenge(buildChallenge({ sequence: '42' }), USER),
    ).rejects.toThrow()
  })

  it('rejects a challenge whose manageData is signed by the user', async () => {
    await expect(
      assertValidTransactionChallenge(buildChallenge({ operationSource: USER }), USER),
    ).rejects.toThrow()
  })

  it('rejects a challenge with no server source account', async () => {
    await expect(
      assertValidTransactionChallenge(buildChallenge({ operationSource: null }), USER),
    ).rejects.toThrow()
  })

  it('rejects a challenge with no near-future expiry', async () => {
    await expect(
      assertValidTransactionChallenge(buildChallenge({ timebounds: null }), USER),
    ).rejects.toThrow()

    await expect(
      assertValidTransactionChallenge(
        buildChallenge({ timebounds: { minTime: 0, maxTime: FUTURE_MAX_TIME + 3600 } }),
        USER,
      ),
    ).rejects.toThrow()
  })

  it('rejects a foreign network passphrase', async () => {
    await expect(
      assertValidTransactionChallenge(buildChallenge(), USER, 'Foreign Network ; November 2020'),
    ).rejects.toThrow()
  })

  it('rejects malformed XDR', async () => {
    await expect(assertValidTransactionChallenge('not-an-xdr', USER)).rejects.toThrow()
  })
})

describe('assertValidMessageChallenge', () => {
  it('accepts a message that names the wallet', () => {
    expect(() => assertValidMessageChallenge(`Sign in to Heliobond\n${USER}`, USER)).not.toThrow()
  })

  it('rejects a message that is not bound to the wallet', () => {
    expect(() => assertValidMessageChallenge('Sign in to Heliobond', USER)).toThrow()
  })

  it('rejects an over-long message', () => {
    expect(() =>
      assertValidMessageChallenge('x'.repeat(MAX_MESSAGE_LENGTH + 1) + USER, USER),
    ).toThrow()
  })

  it('rejects control characters', () => {
    expect(() => assertValidMessageChallenge(`Sign in\x00${USER}`, USER)).toThrow()
  })
})
