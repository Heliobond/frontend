/**
 * Heliobond circuit breaker — protects outbound calls (e.g. Stellar RPC)
 * from a failing downstream service.
 *
 * States: CLOSED (normal) → OPEN (failing, calls rejected) → HALF_OPEN
 * (recovery window elapsed, probing) → CLOSED.
 *
 * #508: HALF_OPEN admits a **single trial call**. Concurrent callers that
 * arrive while the canary is in flight either wait for its verdict or fail
 * fast — a recovering endpoint never sees a stampede the instant the
 * recovery timeout elapses.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening the breaker. */
  failureThreshold: number
  /** Successful trial calls in HALF_OPEN before closing. */
  successThreshold: number
  /** How long the breaker stays OPEN before allowing a trial call. */
  recoveryTimeoutMs: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  recoveryTimeoutMs: 30_000,
}

/** Error thrown when the breaker is OPEN (or its trial slot is taken). */
export class CircuitOpenError extends Error {
  constructor(state: CircuitState) {
    super(`Circuit breaker is ${state}`)
    this.name = 'CircuitOpenError'
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private generation = 0
  private failures = 0
  private successes = 0
  private openedAt: number | null = null

  /**
   * Number of trial calls currently admitted in HALF_OPEN. #508: this is
   * capped at one — the canary — until it resolves and the breaker
   * transitions. Callers arriving while the slot is taken fail fast with
   * CircuitOpenError instead of stampeding the recovering endpoint.
   */
  private trialsInFlight = 0

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  readonly config: CircuitBreakerConfig

  getState(): CircuitState {
    return this.state
  }

  /**
   * Runs `fn` under breaker protection. In HALF_OPEN only the first caller
   * (the canary) invokes `fn`; later callers receive CircuitOpenError until
   * the canary resolves and the breaker closes or re-opens.
   */
  async execute<T>(fn: () => Promise<T>, fallback?: (err: unknown) => T): Promise<T> {
    if (!this.tryAdmit()) {
      if (fallback) return fallback(new CircuitOpenError(this.state))
      throw new CircuitOpenError(this.state)
    }

    // Admission can transition OPEN to HALF_OPEN. Capture its generation afterward.
    const generation = this.generation
    try {
      const result = await fn()
      if (generation === this.generation) this.onSuccess()
      return result
    } catch (err) {
      if (generation === this.generation) this.onFailure()
      if (fallback) return fallback(err)
      throw err
    }
  }

  /**
   * Atomically decides whether this caller may invoke `fn` right now.
   * Returns false when the breaker is OPEN (recovery window not elapsed)
   * or when the single HALF_OPEN trial slot is already taken.
   */
  private tryAdmit(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - (this.openedAt ?? 0) < this.config.recoveryTimeoutMs) {
        return false
      }
      // Recovery window elapsed: transition and let the first caller through.
      this.transition('HALF_OPEN')
    }

    if (this.state === 'HALF_OPEN') {
      if (this.trialsInFlight > 0) {
        // Canary already probing — reject rather than stampede (#508).
        return false
      }
      this.trialsInFlight++
      return true
    }

    return true // CLOSED
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.trialsInFlight--
      this.successes++
      this.failures = 0
      if (this.successes >= this.config.successThreshold) {
        this.transition('CLOSED')
      }
      return
    }
    this.failures = 0
  }

  private onFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.trialsInFlight--
      this.transition('OPEN')
      return
    }
    this.failures++
    if (this.failures >= this.config.failureThreshold) {
      this.transition('OPEN')
    }
  }

  private transition(state: CircuitState): void {
    this.state = state
    this.generation++
    if (state === 'OPEN') {
      this.openedAt = Date.now()
      this.successes = 0
    } else if (state === 'HALF_OPEN') {
      this.trialsInFlight = 0
      this.successes = 0
    } else {
      this.failures = 0
      this.successes = 0
      this.trialsInFlight = 0
      this.openedAt = null
    }
  }
}
