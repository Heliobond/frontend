import { describe, it, expect } from 'vitest'
import { parseMoneyInput } from './moneyInput'

describe('parseMoneyInput (#869)', () => {
  it.each([
    ['1,000.50', 'en', 1000.5],
    ['1,5', 'en', null],
    ['1.2.3', 'en', null],
    ['abc', 'en', null],
    ['', 'en', null],
    ['1e6', 'en', null],
    ['250000', 'en', 250000],
    ['  42.5 ', 'en', 42.5],
    ['1,00', 'en', null],
    ['10.999', 'en', null],
  ])('parses %j in %s as %s', (input, locale, expected) => {
    expect(parseMoneyInput(input, locale)).toBe(expected)
  })

  it('reads a comma as the decimal separator in French and Spanish, never as 15', () => {
    expect(parseMoneyInput('1,5', 'fr')).toBe(1.5)
    expect(parseMoneyInput('1,5', 'es')).toBe(1.5)
  })

  it('uses each locale’s own group separator', () => {
    expect(parseMoneyInput('1 000,50', 'fr')).toBe(1000.5)
    expect(parseMoneyInput('1 000,50', 'fr')).toBe(1000.5)
    expect(parseMoneyInput('1.000,50', 'es')).toBe(1000.5)
    expect(parseMoneyInput('1.000,50', 'pt')).toBe(1000.5)
  })

  it('rejects the en-style amount in a comma-decimal locale', () => {
    expect(parseMoneyInput('1,000.50', 'fr')).toBeNull()
    expect(parseMoneyInput('1,000.50', 'es')).toBeNull()
    expect(parseMoneyInput('1.5', 'es')).toBeNull()
  })

  it.each(['1.2.3', 'abc', '', '1e6'])('rejects %j in every locale', (input) => {
    for (const locale of ['en', 'fr', 'es', 'ar', 'pt']) {
      expect(parseMoneyInput(input, locale)).toBeNull()
    }
  })
})
