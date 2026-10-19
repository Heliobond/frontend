import { NETWORK_PASSPHRASE } from '../config/network'
import { AuthError } from './sessionClient'

const MAX_CHALLENGE_TTL_SECONDS = 900
const CLOCK_SKEW_SECONDS = 60
export const MAX_MESSAGE_LENGTH = 4096

/**
 * Validates a SEP-10 transaction challenge before it reaches the wallet (#834).
 *
 * A compromised backend must not be able to hand back an arbitrary transaction
 * for the user to sign. The structural checks below pin the envelope to a
 * SEP-10 challenge: sequence 0, one manageData operation signed by the server,
 * and a short expiry on the app's own network.
 */
export async function assertValidTransactionChallenge(
  xdr: string,
  userAddress: string,
  networkPassphrase?: string,
): Promise<void> {
  if (networkPassphrase !== undefined && networkPassphrase !== NETWORK_PASSPHRASE) {
    throw new AuthError('Sign-in challenge is for a different network')
  }

  const { Transaction, TransactionBuilder } = await import('@stellar/stellar-sdk')

  let transaction: InstanceType<typeof Transaction>
  try {
    const parsed = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE)
    if (!(parsed instanceof Transaction)) {
      throw new Error('not a transaction')
    }
    transaction = parsed
  } catch {
    throw new AuthError('Malformed sign-in challenge')
  }

  if (transaction.sequence !== '0') {
    throw new AuthError('Sign-in challenge has a non-zero sequence number')
  }

  const operations = transaction.operations
  if (operations.length !== 1) {
    throw new AuthError('Sign-in challenge must contain a single operation')
  }

  const operation = operations[0]
  if (operation.type !== 'manageData') {
    throw new AuthError('Sign-in challenge is not a SEP-10 challenge')
  }
  if (!operation.source || operation.source === userAddress) {
    throw new AuthError('Sign-in challenge is not signed by the server')
  }
  if (!/ auth$/.test(operation.name ?? '')) {
    throw new AuthError('Sign-in challenge is not a SEP-10 challenge')
  }

  const now = Math.floor(Date.now() / 1000)
  const maxTime = transaction.timeBounds ? Number(transaction.timeBounds.maxTime) : NaN
  if (!Number.isFinite(maxTime) || maxTime <= now || maxTime > now + MAX_CHALLENGE_TTL_SECONDS) {
    throw new AuthError('Sign-in challenge has no near-future expiry')
  }
  const minTime = transaction.timeBounds ? Number(transaction.timeBounds.minTime) : 0
  if (Number.isFinite(minTime) && minTime > now + CLOCK_SKEW_SECONDS) {
    throw new AuthError('Sign-in challenge is not valid yet')
  }
}

/**
 * Bounds a SEP-53 message challenge and binds it to the connected wallet, so a
 * malicious backend cannot get a long or unrelated statement signed (#834).
 */
export function assertValidMessageChallenge(message: string, userAddress: string): void {
  if (typeof message !== 'string' || message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    throw new AuthError('Malformed sign-in challenge')
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) {
    throw new AuthError('Malformed sign-in challenge')
  }
  if (!message.includes(userAddress)) {
    throw new AuthError('Sign-in challenge is not bound to this wallet')
  }
}
