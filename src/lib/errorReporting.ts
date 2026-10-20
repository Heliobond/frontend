// Client error reporting and web-vitals sink (#609). Dependency-free: events are
// posted as JSON to NEXT_PUBLIC_ERROR_REPORT_URL (an OpenTelemetry/Sentry-relay or
// any collector) and mirrored to the page's analytics client.
//
// Telemetry is opt-in (#658): nothing is sent until the visitor records a choice
// with setTelemetryConsent('granted') through the consent banner, and a recorded
// 'denied' — or Do-Not-Track / Global Privacy Control — always wins.
// Payloads never contain wallet addresses, hashes, emails or XDR — see scrub(),
// which also runs over every string in the caller-supplied `context`.

import { track } from './analytics'
import { parseContractError, type ContractErrorContext } from './contractErrors'
import { isTelemetryAllowed } from './telemetryConsent'

export {
  TELEMETRY_CONSENT_EVENT,
  TELEMETRY_CONSENT_KEY,
  isTelemetryAllowed,
  readTelemetryConsent,
  setTelemetryConsent,
  type TelemetryConsent,
} from './telemetryConsent'

export type ErrorKind =
  | 'render'
  | 'route'
  | 'root'
  | 'transaction'
  | 'rpc-timeout'
  | 'unhandled-error'
  | 'unhandled-rejection'

export interface ErrorReport {
  type: 'error'
  kind: ErrorKind
  message: string
  stack?: string
  /** Numeric Soroban contract error code, when the failure carried one. */
  contractErrorCode?: number
  contractErrorName?: string
  /** Free-form context such as the operation name. String values are scrubbed. */
  context?: Record<string, string | number | boolean>
  path?: string
  release?: string
  timestamp: number
}

export interface WebVitalReport {
  type: 'web-vital'
  name: string
  value: number
  rating?: string
  id: string
  path?: string
  release?: string
  timestamp: number
}

export type TelemetryEvent = ErrorReport | WebVitalReport

const MAX_MESSAGE = 500
const MAX_STACK = 4000
// Stellar strkeys (G/C/M/S…), 64-hex hashes, emails and long base64 blobs (XDR).
const SCRUBBERS: Array<[RegExp, string]> = [
  [/\b[GCMSTPX][A-Z2-7]{55,}\b/g, '[address]'],
  [/\b[0-9a-fA-F]{64}\b/g, '[hash]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/\b[A-Za-z0-9+/]{80,}={0,2}/g, '[blob]'],
]

/** Strip anything identifying (addresses, hashes, emails, XDR) and cap the length. */
export function scrub(text: string, max = MAX_MESSAGE): string {
  let out = text
  for (const [pattern, replacement] of SCRUBBERS) out = out.replace(pattern, replacement)
  return out.length > max ? `${out.slice(0, max)}…` : out
}

/** Redact every string in the caller-supplied context, as `message`/`stack` are. */
function scrubContext(
  context: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!context) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(context)) {
    out[key] = typeof value === 'string' ? scrub(value) : value
  }
  return out
}

function sinkUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_ERROR_REPORT_URL || undefined
}

function send(event: TelemetryEvent): void {
  if (!isTelemetryAllowed()) return
  const { type, ...rest } = event
  void track(type === 'error' ? 'client_error' : 'web_vital', rest)

  const url = sinkUrl()
  if (!url) return
  const body = JSON.stringify(event)
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))
      if (queued) return
    }
    void fetch(url, {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
    }).catch(() => undefined)
  } catch {
    /* reporting must never throw into the app */
  }
}

function base() {
  return {
    path: typeof location !== 'undefined' ? location.pathname : undefined,
    release: process.env.NEXT_PUBLIC_RELEASE || undefined,
    timestamp: Date.now(),
  }
}

export interface ReportErrorOptions {
  kind: ErrorKind
  context?: Record<string, string | number | boolean>
  contract?: ContractErrorContext
}

/** Report an error. Safe to call from anywhere; it never throws. */
export function reportError(error: unknown, options: ReportErrorOptions): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const contract = parseContractError(err, options.contract)
    send({
      type: 'error',
      kind: options.kind,
      message: scrub(err.message),
      stack: err.stack ? scrub(err.stack, MAX_STACK) : undefined,
      contractErrorCode: contract?.code,
      contractErrorName: contract?.name ?? undefined,
      context: scrubContext(options.context),
      ...base(),
    })
  } catch {
    /* reporting must never throw into the app */
  }
}

/** Report a failed transaction: the contract code, operation and nothing personal. */
export function reportTransactionFailure(
  error: unknown,
  operation: string,
  contract?: ContractErrorContext,
): void {
  reportError(error, { kind: 'transaction', context: { operation }, contract })
}

export interface WebVitalMetric {
  id: string
  name: string
  value: number
  rating?: string
}

/** Metrics worth collecting: Core Web Vitals plus the two load timings. */
const REPORTED_VITALS = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB'])

/** Pass to Next's `useReportWebVitals`, or call directly with a metric. */
export function reportWebVitals(metric: WebVitalMetric): void {
  if (!REPORTED_VITALS.has(metric.name)) return
  send({
    type: 'web-vital',
    name: metric.name,
    // CLS is unitless (~0.05); the rest are milliseconds. Keep 3 decimals.
    value: Math.round(metric.value * 1000) / 1000,
    rating: metric.rating,
    id: metric.id,
    ...base(),
  })
}

let globalHandlersInstalled = false

/** Capture uncaught errors and unhandled promise rejections once per page. */
export function installGlobalErrorHandlers(): () => void {
  if (typeof window === 'undefined' || globalHandlersInstalled) return () => undefined
  globalHandlersInstalled = true
  const onError = (event: ErrorEvent) =>
    reportError(event.error ?? event.message, { kind: 'unhandled-error' })
  const onRejection = (event: PromiseRejectionEvent) =>
    reportError(event.reason, { kind: 'unhandled-rejection' })
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    globalHandlersInstalled = false
  }
}
