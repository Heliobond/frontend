'use client'

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { HORIZON_URL } from '../config/network'

export const FAST_INTERVAL_MS = 15_000
export const SLOW_INTERVAL_MS = 60_000
export const REQUEST_TIMEOUT_MS = 3_000
export const BACKOFF_THRESHOLD = 2

export interface HorizonHealth {
  /** True when Horizon is reachable and the browser is online. */
  isOnline: boolean
  /** Alias for isOnline. */
  isHealthy: boolean
  /** Trigger an immediate health check. */
  checkHealth: () => Promise<boolean>
}

interface Snapshot {
  isOnline: boolean
}

class HorizonHealthPoller {
  private subscribers = new Set<() => void>()
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true
  private consecutiveSuccesses = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private inFlightPromise: Promise<boolean> | null = null
  private running = false
  private snapshot: Snapshot = { isOnline: this.isOnline }

  getSnapshot = (): Snapshot => {
    return this.snapshot
  }

  getServerSnapshot = (): Snapshot => {
    return { isOnline: true }
  }

  subscribe = (onStoreChange: () => void): (() => void) => {
    this.subscribers.add(onStoreChange)
    if (this.subscribers.size === 1) {
      this.start()
    }
    return () => {
      this.subscribers.delete(onStoreChange)
      if (this.subscribers.size === 0) {
        this.stop()
      }
    }
  }

  private start() {
    this.running = true
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
    }

    if (
      (typeof document === 'undefined' || !document.hidden) &&
      (typeof navigator === 'undefined' || navigator.onLine)
    ) {
      void this.checkHealth()
    }
  }

  private stop() {
    this.running = false
    this.clearTimer()
    this.abortInFlight()
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    }
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private abortInFlight() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    if (this.controller) {
      this.controller.abort()
      this.controller = null
    }
  }

  private updateOnline(online: boolean) {
    if (this.isOnline !== online) {
      this.isOnline = online
      this.snapshot = { isOnline: online }
      this.notifySubscribers()
    }
  }

  private notifySubscribers() {
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber()
      } catch {
        /* ignore subscriber notification error */
      }
    })
  }

  private handleOnline = () => {
    this.clearTimer()
    if (typeof document !== 'undefined' && document.hidden) {
      return
    }
    void this.checkHealth()
  }

  private handleOffline = () => {
    this.abortInFlight()
    this.clearTimer()
    this.consecutiveSuccesses = 0
    this.updateOnline(false)
  }

  private handleVisibilityChange = () => {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      this.clearTimer()
      this.abortInFlight()
    } else {
      this.clearTimer()
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.updateOnline(false)
        return
      }
      void this.checkHealth()
    }
  }

  checkHealth = async (): Promise<boolean> => {
    if (this.inFlightPromise) {
      return this.inFlightPromise
    }
    this.inFlightPromise = this.executeCheck().finally(() => {
      this.inFlightPromise = null
    })
    return this.inFlightPromise
  }

  private async executeCheck(): Promise<boolean> {
    if (!this.running) return this.isOnline
    if (typeof document !== 'undefined' && document.hidden) {
      return this.isOnline
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.handleOffline()
      return false
    }

    this.clearTimer()
    this.abortInFlight()

    const controller = new AbortController()
    this.controller = controller

    const timeoutId = setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    this.timeoutId = timeoutId

    let success = false
    try {
      const res = await fetch(HORIZON_URL, {
        signal: controller.signal,
        cache: 'no-store',
      })
      success = res.ok
    } catch {
      success = false
    } finally {
      if (this.timeoutId === timeoutId) {
        clearTimeout(this.timeoutId)
        this.timeoutId = null
      }
      if (this.controller === controller) {
        this.controller = null
      }
    }

    if (!this.running) return this.isOnline
    if (typeof document !== 'undefined' && document.hidden) {
      return this.isOnline
    }

    if (success) {
      this.consecutiveSuccesses++
      this.updateOnline(true)
    } else {
      this.consecutiveSuccesses = 0
      this.updateOnline(false)
    }

    this.scheduleNext()
    return success
  }

  private scheduleNext() {
    this.clearTimer()
    if (!this.running) return
    if (typeof document !== 'undefined' && document.hidden) return

    const interval =
      this.consecutiveSuccesses >= BACKOFF_THRESHOLD ? SLOW_INTERVAL_MS : FAST_INTERVAL_MS

    this.timer = setTimeout(() => {
      void this.checkHealth()
    }, interval)
  }

  resetForTesting() {
    this.stop()
    this.subscribers.clear()
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    this.consecutiveSuccesses = 0
    this.snapshot = { isOnline: this.isOnline }
    this.inFlightPromise = null
  }
}

export const horizonHealthPoller = new HorizonHealthPoller()

const HorizonHealthContext = createContext<HorizonHealth | null>(null)

function useHorizonHealthStore(): HorizonHealth {
  const snapshot = useSyncExternalStore(
    horizonHealthPoller.subscribe,
    horizonHealthPoller.getSnapshot,
    horizonHealthPoller.getServerSnapshot,
  )

  return useMemo(
    () => ({
      isOnline: snapshot.isOnline,
      isHealthy: snapshot.isOnline,
      checkHealth: horizonHealthPoller.checkHealth,
    }),
    [snapshot.isOnline],
  )
}

export function HorizonHealthProvider({
  children,
  value,
}: {
  children: ReactNode
  value?: HorizonHealth
}) {
  const storeHealth = useHorizonHealthStore()
  const contextValue = value ?? storeHealth

  return (
    <HorizonHealthContext.Provider value={contextValue}>{children}</HorizonHealthContext.Provider>
  )
}

export function useHorizonHealth(): HorizonHealth {
  const context = useContext(HorizonHealthContext)
  const storeHealth = useHorizonHealthStore()
  return context ?? storeHealth
}
