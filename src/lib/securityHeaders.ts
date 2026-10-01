// Security headers and Content-Security-Policy (#601). The app signs financial
// transactions in the browser, so an injected script could swap the XDR before it
// reaches the wallet. `proxy.ts` sets the CSP per request with a nonce; the static
// headers below are applied to every route from next.config.ts.

import { HORIZON_URL, SOROBAN_RPC_URL } from '../config/network'

export type CspMode = 'report-only' | 'enforce'

/** Report-only until `CSP_MODE=enforce` is set, so a rollout can't break signing. */
export function resolveCspMode(value = process.env.CSP_MODE): CspMode {
  return value === 'enforce' ? 'enforce' : 'report-only'
}

export function cspHeaderName(mode: CspMode): string {
  return mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'
}

// WalletConnect relay, verify and explorer endpoints used by wallet-kit sessions.
const WALLETCONNECT_CONNECT = [
  'https://*.walletconnect.com',
  'https://*.walletconnect.org',
  'wss://*.walletconnect.com',
  'wss://*.walletconnect.org',
]
const WALLETCONNECT_FRAMES = [
  'https://verify.walletconnect.com',
  'https://verify.walletconnect.org',
]

/** Reduce a configured URL to its origin; drops unparsable or empty values. */
function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export interface CspOptions {
  nonce: string
  isDev?: boolean
  horizonUrl?: string
  rpcUrl?: string
  apiUrl?: string
  /** Error/telemetry sink (#609). */
  reportUrl?: string
  /** Where the browser posts CSP violation reports. */
  cspReportUri?: string
  authUrl?: string
  wsUrl?: string
}

export function buildCsp(options: CspOptions): string {
  const {
    nonce,
    isDev = false,
    horizonUrl = HORIZON_URL,
    rpcUrl = SOROBAN_RPC_URL,
    apiUrl = process.env.NEXT_PUBLIC_API_URL,
    reportUrl = process.env.NEXT_PUBLIC_ERROR_REPORT_URL,
    cspReportUri = process.env.NEXT_PUBLIC_CSP_REPORT_URI,
    authUrl = process.env.NEXT_PUBLIC_AUTH_URL,
    wsUrl = process.env.NEXT_PUBLIC_WS_URL,
  } = options

  const connect = new Set<string>(["'self'", ...WALLETCONNECT_CONNECT])
  for (const url of [horizonUrl, rpcUrl, apiUrl, reportUrl, authUrl, wsUrl]) {
    const origin = originOf(url)
    if (origin) connect.add(origin)
  }
  if (isDev) {
    connect.add('ws:')
    connect.add('http://localhost:*')
  }

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    [
      'script-src',
      ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    ],
    // React inline `style=` attributes are used throughout, so styles keep
    // 'unsafe-inline'; scripts are what carries the XSS risk.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', [...connect]],
    ['frame-src', WALLETCONNECT_FRAMES],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  if (!isDev) directives.push(['upgrade-insecure-requests', []])
  if (cspReportUri) directives.push(['report-uri', [cspReportUri]])

  return directives.map(([name, values]) => [name, ...values].join(' ')).join('; ')
}

/** Random per-request nonce (base64, Edge/Node compatible). */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export interface HeaderEntry {
  key: string
  value: string
}

/** Headers that don't depend on the request. Applied to all routes. */
export const STATIC_SECURITY_HEADERS: HeaderEntry[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // frame-ancestors in the CSP is the modern control; this covers older browsers.
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
  },
]
