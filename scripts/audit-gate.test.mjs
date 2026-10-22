import { describe, expect, it } from 'vitest'
import { evaluateAudit } from './audit-gate.mjs'

const TODAY = new Date('2026-10-22T12:00:00Z')

function finding(severity, id = '1234', title = 'a problem') {
  return {
    id: Number(id),
    url: `https://github.com/advisories/GHSA-${id}-aaaa-bbbb`,
    title,
    severity,
  }
}

function report(pkg, ...advisories) {
  return JSON.stringify({ [pkg]: advisories })
}

describe('evaluateAudit', () => {
  it('passes a clean audit', () => {
    const result = evaluateAudit({ status: 0, stdout: '{}', today: TODAY })
    expect(result).toEqual({ ok: true, failures: [], warnings: [] })
  })

  it('fails when the audit tool cannot start', () => {
    const result = evaluateAudit({ error: new Error('spawn bun ENOENT'), today: TODAY })
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toMatch(/could not run: spawn bun ENOENT/)
  })

  it('fails on an unexpected exit code even with valid JSON', () => {
    const result = evaluateAudit({ status: 2, stdout: '{}', stderr: 'boom', today: TODAY })
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toMatch(/exited with 2: boom/)
  })

  it('fails on unparseable output instead of passing', () => {
    const result = evaluateAudit({ status: 0, stdout: '<html>rate limited</html>', today: TODAY })
    expect(result).toMatchObject({ ok: false, failures: ['bun audit produced unparseable output'] })
  })

  it('fails when the output is valid JSON but not an advisory map', () => {
    const result = evaluateAudit({ status: 0, stdout: '[]', today: TODAY })
    expect(result.ok).toBe(false)
  })

  it('fails when exit 1 reports no findings', () => {
    const result = evaluateAudit({ status: 1, stdout: '{}', today: TODAY })
    expect(result).toMatchObject({
      ok: false,
      failures: ['bun audit reported failure without any findings'],
    })
  })

  it('fails on an unallowlisted high advisory', () => {
    const result = evaluateAudit({
      status: 1,
      stdout: report('axios', finding('high')),
      today: TODAY,
    })
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toMatch(/^axios high GHSA-1234-aaaa-bbbb: a problem/)
  })

  it('fails on an unallowlisted critical advisory', () => {
    const result = evaluateAudit({
      status: 1,
      stdout: report('next', finding('critical')),
      today: TODAY,
    })
    expect(result.ok).toBe(false)
  })

  it('only warns on moderate and low advisories', () => {
    const stdout = report('uuid', finding('moderate'), finding('low', '5678'))
    const result = evaluateAudit({ status: 1, stdout, today: TODAY })
    expect(result.ok).toBe(true)
    expect(result.warnings).toHaveLength(2)
  })

  it('accepts a high advisory covered by an unexpired allowlist entry', () => {
    const allowlist = [
      { id: 'GHSA-1234-aaaa-bbbb', package: 'braces', reason: 'no fix', expires: '2026-12-31' },
    ]
    const result = evaluateAudit({
      status: 1,
      stdout: report('braces', finding('high')),
      allowlist,
      today: TODAY,
    })
    expect(result.ok).toBe(true)
    expect(result.warnings[0]).toMatch(/allowlisted: no fix/)
  })

  it('does not apply an allowlist entry to a different package', () => {
    const allowlist = [
      { id: 'GHSA-1234-aaaa-bbbb', package: 'other', reason: 'no fix', expires: '2026-12-31' },
    ]
    const result = evaluateAudit({
      status: 1,
      stdout: report('braces', finding('high')),
      allowlist,
      today: TODAY,
    })
    expect(result.ok).toBe(false)
  })

  it('fails when an allowlist entry has expired', () => {
    const allowlist = [
      { id: 'GHSA-1234-aaaa-bbbb', package: 'braces', reason: 'no fix', expires: '2026-10-01' },
    ]
    const result = evaluateAudit({
      status: 1,
      stdout: report('braces', finding('high')),
      allowlist,
      today: TODAY,
    })
    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /allowlist entry GHSA-1234-aaaa-bbbb \(braces\) expired on 2026-10-01/,
        ),
      ]),
    )
  })

  it('keeps an allowlist entry valid through its expiry day', () => {
    const allowlist = [
      { id: 'GHSA-1234-aaaa-bbbb', package: 'braces', reason: 'no fix', expires: '2026-10-22' },
    ]
    const result = evaluateAudit({
      status: 1,
      stdout: report('braces', finding('high')),
      allowlist,
      today: TODAY,
    })
    expect(result.ok).toBe(true)
  })

  it('warns about allowlist entries that no longer match a finding', () => {
    const allowlist = [
      { id: 'GHSA-9999-aaaa-bbbb', package: 'gone', reason: 'old', expires: '2026-12-31' },
    ]
    const result = evaluateAudit({ status: 0, stdout: '{}', allowlist, today: TODAY })
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([expect.stringMatching(/matches no current finding/)])
  })
})
