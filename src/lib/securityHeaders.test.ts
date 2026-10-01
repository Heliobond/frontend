import { describe, expect, it } from 'vitest'

import {
  STATIC_SECURITY_HEADERS,
  buildCsp,
  cspHeaderName,
  generateNonce,
  resolveCspMode,
} from './securityHeaders'

const base = {
  nonce: 'abc123',
  horizonUrl: 'https://horizon-testnet.stellar.org/',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  apiUrl: 'https://api.heliobond.test/v1',
  reportUrl: 'https://telemetry.heliobond.test/ingest',
  cspReportUri: undefined,
  authUrl: 'https://auth.heliobond.test/login',
  wsUrl: 'wss://ws.heliobond.test/events',
}

function directive(csp: string, name: string): string[] {
  const found = csp.split('; ').find((d) => d.startsWith(`${name} `) || d === name)
  return found ? found.split(' ').slice(1) : []
}

describe('buildCsp', () => {
  const csp = buildCsp(base)

  it('allows scripts only from self and the request nonce', () => {
    expect(directive(csp, 'script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"])
  })

  it('limits connect-src to configured endpoints and WalletConnect', () => {
    const connect = directive(csp, 'connect-src')
    expect(connect).toEqual(
      expect.arrayContaining([
        "'self'",
        'https://horizon-testnet.stellar.org',
        'https://soroban-testnet.stellar.org',
        'https://api.heliobond.test',
        'https://telemetry.heliobond.test',
        'https://auth.heliobond.test',
        'wss://ws.heliobond.test',
        'wss://*.walletconnect.org',
      ]),
    )
    expect(connect).not.toContain('https:')
  })

  it('blocks framing, plugins and base-tag injection', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
    expect(directive(csp, 'base-uri')).toEqual(["'self'"])
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('only loosens scripts and sockets in development', () => {
    const dev = buildCsp({ ...base, isDev: true })
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(dev, 'connect-src')).toContain('ws:')
    expect(csp).not.toContain('unsafe-eval')
  })

  it('adds a report-uri when configured', () => {
    expect(buildCsp({ ...base, cspReportUri: '/csp-report' })).toContain('report-uri /csp-report')
  })
})

describe('mode and helpers', () => {
  it('defaults to report-only and enforces on request', () => {
    expect(resolveCspMode(undefined)).toBe('report-only')
    expect(resolveCspMode('enforce')).toBe('enforce')
    expect(cspHeaderName('report-only')).toBe('Content-Security-Policy-Report-Only')
    expect(cspHeaderName('enforce')).toBe('Content-Security-Policy')
  })

  it('generates unique nonces', () => {
    expect(generateNonce()).not.toBe(generateNonce())
  })

  it('ships the required static headers', () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'Referrer-Policy',
        'Permissions-Policy',
      ]),
    )
    expect(STATIC_SECURITY_HEADERS.find((h) => h.key === 'Referrer-Policy')?.value).toBe(
      'strict-origin-when-cross-origin',
    )
  })
})
