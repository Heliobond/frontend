import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TELEMETRY_CONSENT_KEY,
  isTelemetryAllowed,
  reportError,
  reportTransactionFailure,
  reportWebVitals,
  scrub,
} from './errorReporting'

const ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
const HASH = 'a'.repeat(64)

describe('scrub', () => {
  it('removes addresses, hashes and emails', () => {
    const out = scrub(`failed for ${ADDRESS} tx ${HASH} user me@example.com`)
    expect(out).toBe('failed for [address] tx [hash] user [email]')
  })

  it('caps length', () => {
    expect(scrub('x'.repeat(900)).length).toBeLessThanOrEqual(501)
  })
})

describe('reporting', () => {
  const beacon = vi.fn(() => true)

  beforeEach(() => {
    localStorage.clear()
    beacon.mockClear()
    vi.stubEnv('NEXT_PUBLIC_ERROR_REPORT_URL', 'https://telemetry.test/ingest')
    vi.stubGlobal('navigator', { sendBeacon: beacon, doNotTrack: null })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function payload(): Promise<Record<string, unknown>> {
    const blob = (beacon.mock.calls[0] as unknown as [string, Blob])[1]
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blob)
    })
    return JSON.parse(text)
  }

  it('reports a transaction failure with the contract code and no address', async () => {
    reportTransactionFailure(
      new Error(`Simulation failed: Error(Contract, #33) for ${ADDRESS}`),
      'withdraw',
    )
    expect(beacon).toHaveBeenCalledOnce()
    const body = await payload()
    expect(body).toMatchObject({
      type: 'error',
      kind: 'transaction',
      contractErrorCode: 33,
      contractErrorName: 'SlippageLimitExceeded',
      context: { operation: 'withdraw' },
    })
    expect(JSON.stringify(body)).not.toContain(ADDRESS)
  })

  it('does nothing when consent was declined', () => {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, 'denied')
    reportError(new Error('boom'), { kind: 'render' })
    expect(beacon).not.toHaveBeenCalled()
  })

  it('respects Do-Not-Track and Global Privacy Control', () => {
    vi.stubGlobal('navigator', { sendBeacon: beacon, doNotTrack: '1' })
    expect(isTelemetryAllowed()).toBe(false)
    vi.stubGlobal('navigator', { sendBeacon: beacon, doNotTrack: null, globalPrivacyControl: true })
    expect(isTelemetryAllowed()).toBe(false)
  })

  it('collects core web vitals and ignores other metrics', async () => {
    reportWebVitals({ id: '1', name: 'LCP', value: 1234.5678, rating: 'good' })
    reportWebVitals({ id: '2', name: 'Next.js-hydration', value: 10 })
    expect(beacon).toHaveBeenCalledOnce()
    expect(await payload()).toMatchObject({ type: 'web-vital', name: 'LCP', value: 1234.568 })
  })
})
