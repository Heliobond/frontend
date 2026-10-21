'use client'

import { useEffect, useState } from 'react'

type TimeUnit = 'milliseconds' | 'seconds'

function readNow(unit: TimeUnit): number {
  const now = Date.now()
  return unit === 'seconds' ? Math.floor(now / 1000) : now
}

/** A one-second clock that pauses in hidden tabs and resynchronizes on return. */
export function useVisibleNow(unit: TimeUnit = 'milliseconds'): number {
  const [now, setNow] = useState(() => readNow(unit))

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined

    const stop = () => {
      if (interval !== undefined) {
        clearInterval(interval)
        interval = undefined
      }
    }

    const onVisibilityChange = () => {
      stop()
      if (document.hidden) return
      setNow(readNow(unit))
      interval = setInterval(() => setNow(readNow(unit)), 1000)
    }

    if (!document.hidden) interval = setInterval(() => setNow(readNow(unit)), 1000)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [unit])

  return now
}
