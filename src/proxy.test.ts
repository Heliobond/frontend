import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

describe('request security proxy (#723)', () => {
  it('adds a per-request nonce to the CSP response', () => {
    const first = proxy(new NextRequest('https://heliobond.example/'))
    const second = proxy(new NextRequest('https://heliobond.example/'))
    const header = 'Content-Security-Policy-Report-Only'
    const firstCsp = first.headers.get(header)
    const secondCsp = second.headers.get(header)

    expect(firstCsp).toMatch(/nonce-[A-Za-z0-9+/=_-]+/)
    expect(secondCsp).toMatch(/nonce-[A-Za-z0-9+/=_-]+/)
    expect(firstCsp).not.toBe(secondCsp)
  })
})
