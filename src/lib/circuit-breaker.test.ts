import { describe, it, expect } from '@/test/bun'
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Deferred promise — resolves externally, no timers involved. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/**
 * Force a breaker into OPEN via real failures. Loops because
 * failureThreshold may be > 1.
 */
async function tripOpen(breaker: CircuitBreaker) {
  for (let i = 0; i < 20 && breaker.getState() !== 'OPEN'; i++) {
    await breaker
      .execute(async () => {
        throw new Error('downstream down')
      })
      .catch(() => {})
  }
  expect(breaker.getState()).toBe('OPEN')
}

describe('CircuitBreaker', () => {
  it('stays CLOSED on success', async () => {
    const breaker = new CircuitBreaker()
    await expect(breaker.execute(async () => 1)).resolves.toBe(1)
    expect(breaker.getState()).toBe('CLOSED')
  })

  it('opens after failureThreshold consecutive failures', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 })
    for (let i = 0; i < 3; i++) {
      await breaker
        .execute(async () => {
          throw new Error('fail')
        })
        .catch(() => {})
    }
    expect(breaker.getState()).toBe('OPEN')
    await expect(breaker.execute(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError)
  })

  it('rejects with fallback value when OPEN and fallback provided', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 })
    await breaker
      .execute(async () => {
        throw new Error('fail')
      })
      .catch(() => {})
    await expect(
      breaker.execute(
        async () => 'ignored',
        () => 'fallback',
      ),
    ).resolves.toBe('fallback')
  })

  it('transitions to HALF_OPEN after recovery timeout', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 5 })
    await tripOpen(breaker)
    await sleep(10)
    // First caller after the window: admitted as the canary.
    const canary = breaker.execute(async () => 'probe')
    expect(breaker.getState()).toBe('HALF_OPEN')
    await expect(canary).resolves.toBe('probe')
  })

  it('closes after successThreshold trials in HALF_OPEN', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      recoveryTimeoutMs: 5,
    })
    await tripOpen(breaker)

    // Trial 1: canary succeeds → stays HALF_OPEN (1/2 successes).
    await sleep(10)
    await expect(breaker.execute(async () => 1)).resolves.toBe(1)
    expect(breaker.getState()).toBe('HALF_OPEN')

    // Trial 2: second canary succeeds → CLOSED.
    await expect(breaker.execute(async () => 2)).resolves.toBe(2)
    expect(breaker.getState()).toBe('CLOSED')
  })

  it('re-opens immediately when the canary fails in HALF_OPEN', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5, recoveryTimeoutMs: 5 })
    await tripOpen(breaker)
    await sleep(10)

    await breaker
      .execute(async () => {
        throw new Error('still down')
      })
      .catch(() => {})
    expect(breaker.getState()).toBe('OPEN')
    await expect(breaker.execute(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError)
  })

  it.each(['success', 'failure'])(
    'ignores a late CLOSED call that completes with %s',
    async (outcome) => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        recoveryTimeoutMs: 0,
      })
      const oldCall = deferred<string>()
      const late = breaker.execute(
        async () => {
          const result = await oldCall.promise
          if (outcome === 'failure') throw new Error('late failure')
          return result
        },
        () => 'fallback',
      )
      await tripOpen(breaker)

      const trial = deferred<string>()
      const canary = breaker.execute(() => trial.promise)
      oldCall.resolve('late success')
      await expect(late).resolves.toBe(outcome === 'success' ? 'late success' : 'fallback')
      expect(breaker.getState()).toBe('HALF_OPEN')
      await expect(breaker.execute(async () => 'rival')).rejects.toBeInstanceOf(CircuitOpenError)

      trial.resolve('first probe')
      await expect(canary).resolves.toBe('first probe')
      expect(breaker.getState()).toBe('HALF_OPEN')
      await expect(breaker.execute(async () => 'second probe')).resolves.toBe('second probe')
      expect(breaker.getState()).toBe('CLOSED')
    },
  )

  describe('#508 — single-trial HALF_OPEN guard', () => {
    it('admits exactly ONE caller while HALF_OPEN; concurrent callers fail fast', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 5 })
      await tripOpen(breaker)
      await sleep(10)

      let canaryStarted = false
      const gate = deferred<string>()
      const canary = breaker.execute(async () => {
        canaryStarted = true
        return gate.promise
      })

      // Canary admitted; breaker is HALF_OPEN with the trial slot taken.
      expect(canaryStarted).toBe(true)
      expect(breaker.getState()).toBe('HALF_OPEN')

      // Concurrent callers during the trial: rejected, fn never invoked.
      let rivalRan = false
      const rivals = Promise.all([
        breaker
          .execute(async () => {
            rivalRan = true
            return 'should-not-run'
          })
          .catch((e) => e),
        breaker.execute(async () => 'nor-this').catch((e) => e),
      ])
      await expect(rivals).resolves.toEqual([
        expect.any(CircuitOpenError),
        expect.any(CircuitOpenError),
      ])
      expect(rivalRan).toBe(false)

      gate.resolve('probe-result')
      await expect(canary).resolves.toBe('probe-result')
      // After the canary succeeded, breaker is still HALF_OPEN (successThreshold 2 default).
      expect(breaker.getState()).toBe('HALF_OPEN')
    })

    it('concurrent burst at recovery-timeout instant: only one fn invocation total', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 5 })
      await tripOpen(breaker)
      await sleep(10)

      let invocations = 0
      const gate = deferred<string>()
      const burst = Array.from({ length: 10 }, () =>
        breaker
          .execute(async () => {
            invocations++
            return gate.promise
          })
          .catch((e) => e),
      )

      // Let the rejections settle while the canary is still in flight.
      await sleep(20)
      expect(invocations).toBe(1)

      // Release the canary; the burst then settles with 9 CircuitOpenErrors.
      gate.resolve('ok')
      const results = await Promise.all(burst)
      const rejected = results.filter((r) => r instanceof CircuitOpenError)
      expect(rejected).toHaveLength(9)
    })

    it('waits-then-fails callers do not corrupt trial accounting', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        recoveryTimeoutMs: 5,
      })
      await tripOpen(breaker)
      await sleep(10)

      const canary = breaker.execute(async () => 'probe')
      await Promise.allSettled([breaker.execute(async () => 'x').catch((e) => e)])
      await expect(canary).resolves.toBe('probe')

      // Canary success closed the breaker (successThreshold 1); next call admitted normally.
      expect(breaker.getState()).toBe('CLOSED')
      await expect(breaker.execute(async () => 'post-close')).resolves.toBe('post-close')
    })

    it('new canary is admitted after failed trial re-opens and window elapses again', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 5, recoveryTimeoutMs: 5 })
      await tripOpen(breaker)
      await sleep(10)

      // First canary fails → OPEN again.
      await breaker
        .execute(async () => {
          throw new Error('still down')
        })
        .catch(() => {})
      expect(breaker.getState()).toBe('OPEN')

      // Window elapses again → fresh canary admitted.
      await sleep(10)
      await expect(breaker.execute(async () => 'recovered')).resolves.toBe('recovered')
    })
  })
})
