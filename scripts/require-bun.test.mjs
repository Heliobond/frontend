import { describe, expect, it } from 'vitest'
import { isBunUserAgent } from './require-bun.mjs'

describe('isBunUserAgent', () => {
  it('accepts a bun user agent', () => {
    expect(isBunUserAgent('bun/1.3.14 npm/? node/v24.3.0 linux x64')).toBe(true)
  })

  it('rejects npm, yarn and pnpm user agents', () => {
    expect(isBunUserAgent('npm/11.13.0 node/v24.16.0 linux x64')).toBe(false)
    expect(isBunUserAgent('yarn/1.22.22 npm/? node/v22.0.0')).toBe(false)
    expect(isBunUserAgent('pnpm/10.0.0 npm/? node/v22.0.0')).toBe(false)
  })

  it('rejects a missing user agent', () => {
    expect(isBunUserAgent(undefined)).toBe(false)
    expect(isBunUserAgent('')).toBe(false)
  })

  it('does not accept a user agent that merely contains bun', () => {
    expect(isBunUserAgent('npm/11.0.0 not-bun/1.0.0')).toBe(false)
  })
})
