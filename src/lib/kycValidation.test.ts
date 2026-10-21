import { describe, it, expect } from 'vitest'

import {
  validateDobFormat,
  formatDobForDisplay,
  validateAddress,
  hasMaliciousContent,
  escapeHtml,
  type AddressValues,
} from './kycValidation'

describe('security validation edge cases', () => {
  it('rejects XSS in DOB', () => {
    for (const value of ['<script>alert(1)</script>', 'javascript:alert(1)', '%3Cscript%3E']) {
      expect(validateDobFormat(value).valid).toBe(false)
    }
  })

  it('rejects SQL injection in DOB', () => {
    expect(validateDobFormat("'; DROP TABLE users;--").valid).toBe(false)
  })

  it('escapes malicious input in DOB display', () => {
    expect(formatDobForDisplay('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
    expect(formatDobForDisplay('"><img src=x onerror=alert(1)>')).toBe(
      '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;',
    )
  })

  it('detects XSS and SQL attack patterns', () => {
    expect(hasMaliciousContent('<SCRIPT>alert(1)</SCRIPT>')).toBe(true)
    expect(hasMaliciousContent('JaVaScRiPt:alert(1)')).toBe(true)
    expect(hasMaliciousContent('1 OR 1=1')).toBe(true)
    expect(hasMaliciousContent("admin' --")).toBe(true)
    expect(hasMaliciousContent('Springfield IL')).toBe(false)
  })

  it('rejects malicious address fields', () => {
    const valid: AddressValues = {
      street: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      country: 'US',
    }
    expect(validateAddress({ ...valid, street: '<script>x</script>' }).street).toBe('streetInvalid')
    expect(validateAddress({ ...valid, city: "'; DROP TABLE users;--" }).city).toBe('cityInvalid')
    expect(validateAddress({ ...valid, state: '<svg/onload=alert(1)>' }).state).toBe('stateInvalid')
    expect(validateAddress({ ...valid, zip: '<script>x</script>' }).zip).toBe('zipInvalid')
    expect(validateAddress({ ...valid, country: '"><img src=x onerror=alert(1)>' }).country).toBe(
      'countryInvalid',
    )
    expect(validateAddress({ ...valid, apartment: '<script>x</script>' }).apartment).toBe(
      'apartmentInvalid',
    )
  })

  it('returns required keys for empty fields but not for the optional apartment', () => {
    expect(
      validateAddress({ street: ' ', city: '', state: '', zip: '', country: '', apartment: '' }),
    ).toEqual({
      street: 'streetRequired',
      city: 'cityRequired',
      state: 'stateRequired',
      zip: 'zipRequired',
      country: 'countryRequired',
    })
  })

  it('accepts ordinary address words that resemble SQL keywords', () => {
    const valid: AddressValues = {
      street: '12 Union Street',
      city: 'Union City',
      state: 'NJ',
      zip: '07001',
      country: 'US',
      apartment: 'Flat 2, Building 3 and 4',
    }
    expect(validateAddress(valid)).toEqual({})
    expect(validateAddress({ ...valid, street: '1 Main St and 2nd Ave' })).toEqual({})
  })

  describe('postal code and state shape (#871)', () => {
    const address = (country: string, zip: string, state = 'X'): AddressValues => ({
      street: '1 Main St',
      city: 'Springfield',
      state,
      zip,
      country,
    })

    it.each([
      ['US', '62701', 'IL'],
      ['US', '62701-1234', 'IL'],
      ['US', '627011234', 'IL'],
      ['CA', 'K1A 0B1', 'ON'],
      ['CA', 'k1a0b1', 'qc'],
      ['GB', 'SW1A 1AA', 'London'],
      ['GB', 'EC1A 1BB', 'London'],
      ['GB', 'W1A 0AX', 'London'],
      ['GB', 'M1 1AE', 'Manchester'],
      ['GB', 'B33 8TH', 'West Midlands'],
      ['GB', 'CR2 6XH', 'Surrey'],
      ['GB', 'DN55 1PT', 'Yorkshire'],
      ['DE', '01067', 'Sachsen'],
      ['FR', '75008', 'Île-de-France'],
    ])('accepts %s ZIP %j with state %j', (country, zip, state) => {
      expect(validateAddress(address(country, zip, state))).toEqual({})
    })

    it.each([
      ['US', 'abc'],
      ['US', '1234'],
      ['US', '123456'],
      ['US', '12345-678'],
      ['CA', 'D1A 0B1'],
      ['CA', 'W1A 0B1'],
      ['CA', '12345'],
      ['GB', 'Q1 1AA'],
      ['GB', 'SW1A 1AC'],
      ['GB', '12345'],
      ['DE', '1234'],
      ['DE', 'ABCDE'],
      ['FR', '750081'],
    ])('rejects %s ZIP %j', (country, zip) => {
      const state = country === 'US' ? 'IL' : country === 'CA' ? 'ON' : 'Region'
      expect(validateAddress(address(country, zip, state)).zip).toBe('zipFormat')
    })

    it.each([
      ['US', 'Q'],
      ['US', 'ZZ'],
      ['US', 'Illinois'],
      ['CA', 'PQ'],
    ])('rejects %s state %j', (country, state) => {
      const zip = country === 'US' ? '62701' : 'K1A 0B1'
      expect(validateAddress(address(country, zip, state)).state).toBe('stateFormat')
    })

    it('keeps the character check ahead of the shape check', () => {
      expect(validateAddress(address('US', '<b>', 'IL')).zip).toBe('zipInvalid')
    })

    it('only checks character safety for countries without a known format', () => {
      expect(validateAddress(address('JP', '100-0001', 'Tokyo'))).toEqual({})
    })
  })

  it('escapes apostrophes in display output', () => {
    expect(escapeHtml("'")).toBe('&#39;')
  })
})
