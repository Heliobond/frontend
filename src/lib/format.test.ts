import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime, formatTime, formatSharePrice } from './format'

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
