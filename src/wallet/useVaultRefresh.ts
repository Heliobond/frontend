'use client'

import { useCallback, useEffect, useState } from 'react'
import { subscribeVaultEvents } from '../lib/websocket'
import { subscribeTransactionConfirmed } from './vaultEvents'

/** Refresh visible vault consumers after transactions, contract events, or tab return. */
export function useVaultRefresh(enabled: boolean) {
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => {
    if (!document.hidden) setTick((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const unsubscribeTransaction = subscribeTransactionConfirmed(refresh)
    const unsubscribeEvents = subscribeVaultEvents((event) => {
      if (['Deposit', 'Withdraw', 'YieldReceived'].includes(event.type)) refresh()
    })
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      timer = setInterval(refresh, 30000)
    }
    const visibilityChanged = () => {
      clearInterval(timer)
      if (!document.hidden) {
        refresh()
        start()
      }
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibilityChanged)
      unsubscribeTransaction()
      unsubscribeEvents()
    }
  }, [enabled, refresh])
  return { tick, refresh }
}
