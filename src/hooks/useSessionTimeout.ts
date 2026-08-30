'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseSessionTimeoutOptions {
  /** Total idle time before session times out in milliseconds. Default: 15 minutes (900,000 ms). */
  timeoutMs?: number
  /** Duration before timeout when warning modal appears in milliseconds. Default: 2 minutes (120,000 ms). */
  warningMs?: number
  /** Throttling delay for activity event listeners in milliseconds. Default: 1,000 ms. */
  throttleMs?: number
  /** Whether timeout monitoring is active (e.g. true only when user is logged in). */
  enabled?: boolean
  /** Callback fired when timeout occurs and user should be logged out. */
  onTimeout?: () => void
  /** Callback fired when warning modal is triggered. */
  onWarning?: () => void
}

export interface UseSessionTimeoutReturn {
  /** Whether the session expiration warning modal should be visible. */
  isWarningOpen: boolean
  /** Remaining seconds until the session expires. */
  remainingSeconds: number
  /** Resets the inactivity timer and dismisses the warning modal. */
  extendSession: () => void
  /** Immediately expires the session and triggers the timeout callback. */
  expireNow: () => void
  /** Formats remaining seconds as MM:SS string. */
  formattedRemaining: string
}

export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
export const DEFAULT_WARNING_MS = 2 * 60 * 1000 // 2 minutes
export const DEFAULT_THROTTLE_MS = 1000 // 1 second

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
]

/**
 * Hook for detecting user inactivity, providing a preemptive timeout warning,
 * and protecting against unsaved form data loss.
 */
export function useSessionTimeout({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  warningMs = DEFAULT_WARNING_MS,
  throttleMs = DEFAULT_THROTTLE_MS,
  enabled = true,
  onTimeout,
  onWarning,
}: UseSessionTimeoutOptions = {}): UseSessionTimeoutReturn {
  const [isWarningOpen, setIsWarningOpen] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(Math.round(warningMs / 1000))

  const lastActivityRef = useRef<number>(Date.now())
  const lastThrottleRef = useRef<number>(0)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const onTimeoutRef = useRef(onTimeout)
  const onWarningRef = useRef(onWarning)

  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  useEffect(() => {
    onWarningRef.current = onWarning
  }, [onWarning])

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }, [])

  const expireNow = useCallback(() => {
    clearTimers()
    setIsWarningOpen(false)
    if (onTimeoutRef.current) {
      onTimeoutRef.current()
    }
  }, [clearTimers])

  const startCountdown = useCallback(() => {
    clearTimers()
    setIsWarningOpen(true)
    if (onWarningRef.current) {
      onWarningRef.current()
    }

    const expiryTime = lastActivityRef.current + timeoutMs

    const updateCountdown = () => {
      const remainingMs = expiryTime - Date.now()
      const secs = Math.max(0, Math.ceil(remainingMs / 1000))
      setRemainingSeconds(secs)

      if (secs <= 0) {
        expireNow()
      }
    }

    updateCountdown()
    countdownIntervalRef.current = setInterval(updateCountdown, 1000)
  }, [clearTimers, expireNow, timeoutMs])

  const scheduleWarning = useCallback(() => {
    clearTimers()
    setIsWarningOpen(false)
    lastActivityRef.current = Date.now()

    const warningDelay = Math.max(0, timeoutMs - warningMs)
    warningTimerRef.current = setTimeout(() => {
      startCountdown()
    }, warningDelay)
  }, [clearTimers, startCountdown, timeoutMs, warningMs])

  const extendSession = useCallback(() => {
    scheduleWarning()
  }, [scheduleWarning])

  // Track user activity with throttled event handler
  useEffect(() => {
    if (!enabled) {
      clearTimers()
      setIsWarningOpen(false)
      return
    }

    scheduleWarning()

    const handleUserActivity = () => {
      // Do not reset activity automatically while the warning modal is actively open
      // (user must explicitly click Extend Session)
      if (isWarningOpen) return

      const now = Date.now()
      if (now - lastThrottleRef.current > throttleMs) {
        lastThrottleRef.current = now
        scheduleWarning()
      }
    }

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true })
    })

    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleUserActivity)
      })
    }
  }, [enabled, isWarningOpen, scheduleWarning, clearTimers, throttleMs])

  // Format MM:SS for countdown display
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedRemaining = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return {
    isWarningOpen,
    remainingSeconds,
    extendSession,
    expireNow,
    formattedRemaining,
  }
}
