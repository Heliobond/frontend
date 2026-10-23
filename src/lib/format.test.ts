import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatSharePrice,
  formatNumber,
  formatMoney,
} from './format'

describe('formatSharePrice', () => {
  it('formats to 4 decimals', () => {
    expect(formatSharePrice(1.0058)).toBe('1.0058')
  })

  it('rounds to 4 decimals consistently', () => {
    expect(formatSharePrice(1.00585)).toBe('1.0059')
    expect(formatSharePrice(1.00584)).toBe('1.0058')
  })

  it('pads shorter values with trailing zeros', () => {
    expect(formatSharePrice(1.5)).toBe('1.5000')
    expect(formatSharePrice(1)).toBe('1.0000')
  })
})

describe('locale-aware date formatting (#461)', () => {
  // Constructed in local time so the calendar day is 2024-12-31 everywhere.
  const timestamp = new Date(2024, 11, 31, 13, 30, 45)

  it('renders de-DE as 31.12.2024', () => {
    expect(formatDate(timestamp, 'de-DE')).toBe('31.12.2024')
  })

  it('renders en-US as 12/31/2024', () => {
    expect(formatDate(timestamp, 'en-US')).toBe('12/31/2024')
  })

  it('falls back to the safe default locale when none is passed', () => {
    expect(formatDate(timestamp)).toBe('12/31/2024')
  })

  it('accepts numbers and ISO strings like the call sites', () => {
    expect(formatDate(timestamp.getTime(), 'de-DE')).toBe('31.12.2024')
    expect(formatDate('2024-12-31T13:30:45', 'en-US')).toBe('12/31/2024')
  })

  it('formats time and date-time with the active locale', () => {
    expect(formatTime(timestamp, 'de-DE')).toBe('13:30:45')
    expect(formatDateTime(timestamp, 'de-DE')).toBe('31.12.2024, 13:30:45')
  })
})

describe('locale-aware number separators (#903)', () => {
  const amount = 1234567.89

  it('formats the same amount with different separators per locale', () => {
    const en = formatNumber(amount, { appLocale: 'en' })
    const fr = formatNumber(amount, { appLocale: 'fr' })
    const ar = formatNumber(amount, { appLocale: 'ar' })
    const pt = formatNumber(amount, { appLocale: 'pt' })

    expect(en).toBe('1,234,567.89')
    expect(fr).toBe('1\u202f234\u202f567,89')
    expect(pt).toBe('1.234.567,89')

    expect(new Set([en, fr, ar, pt]).size).toBe(4)
    expect(en).not.toBe(fr)
    expect(en).not.toBe(pt)
    expect(fr).not.toBe(pt)
  })

  it('formats money with locale-specific grouping and symbol placement', () => {
    const en = formatMoney(amount, { includeSymbol: true, appLocale: 'en', fractionDigits: 2 })
    const fr = formatMoney(amount, { includeSymbol: true, appLocale: 'fr', fractionDigits: 2 })
    const ar = formatMoney(amount, { includeSymbol: true, appLocale: 'ar', fractionDigits: 2 })
    const pt = formatMoney(amount, { includeSymbol: true, appLocale: 'pt', fractionDigits: 2 })

    expect(en).toContain('$')
    expect(new Set([en, fr, ar, pt]).size).toBe(4)
  })

  it('falls back to en-US when no locale is supplied', () => {
    expect(formatNumber(amount)).toBe('1,234,567.89')
  })
})
