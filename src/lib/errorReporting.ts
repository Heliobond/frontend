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

export const TELEMETRY_CONSENT_KEY = 'hb-telemetry-consent'

export type TelemetryConsent = 'granted' | 'denied'

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

/** The visitor's recorded choice, or `null` when they haven't chosen yet. */
export function readTelemetryConsent(): TelemetryConsent | null {
  try {
    const value = localStorage.getItem(TELEMETRY_CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

/**
 * Record the visitor's telemetry choice. Driven by the consent banner in
 * `src/components/TelemetryConsent.tsx`; `null` clears the choice so the banner
 * asks again on the next visit.
 */
export function setTelemetryConsent(consent: TelemetryConsent | null): void {
  try {
    if (consent === null) localStorage.removeItem(TELEMETRY_CONSENT_KEY)
    else localStorage.setItem(TELEMETRY_CONSENT_KEY, consent)
  } catch {
    /* storage unavailable — the choice just won't persist */
  }
  // Same-tab listeners (the consent banner) re-read the choice. Other open tabs
  // get a real `storage` event from the browser, which they also listen for.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TELEMETRY_CONSENT_EVENT))
}

/** Fired on `window` whenever the recorded choice changes, same tab or another. */
export const TELEMETRY_CONSENT_EVENT = 'hb-telemetry-consent-change'

/**
 * False unless the visitor explicitly granted consent, and always false on the
 * server or when the browser sends Do-Not-Track / Global Privacy Control. The
 * default is opt-in (#658): no recorded choice means no telemetry.
 */
export function isTelemetryAllowed(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  const dnt = nav.doNotTrack ?? nav.msDoNotTrack ?? (window as { doNotTrack?: string }).doNotTrack
  if (dnt === '1' || dnt === 'yes') return false
  if (nav.globalPrivacyControl === true) return false
  return readTelemetryConsent() === 'granted'
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
