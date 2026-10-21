import { describe, expect, it, vi } from 'vitest'
import { notifyTransactionConfirmed, subscribeTransactionConfirmed } from './vaultEvents'

describe('vault transaction events', () => {
  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTransactionConfirmed(listener)
    notifyTransactionConfirmed('hash-1', 'deposit')
    unsubscribe()
    notifyTransactionConfirmed('hash-2', 'withdraw')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('hash-1', 'deposit')
  })

  it('continues notifying other subscribers when one throws', () => {
    const broken = subscribeTransactionConfirmed(() => {
      throw new Error('listener failure')
    })
    const listener = vi.fn()
    const unsubscribe = subscribeTransactionConfirmed(listener)
    notifyTransactionConfirmed()
    expect(listener).toHaveBeenCalledWith(undefined, undefined)
    broken()
    unsubscribe()
  })
})
