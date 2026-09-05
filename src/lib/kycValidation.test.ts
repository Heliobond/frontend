import { describe, it, expect } from 'vitest';

import { validateDobFormat, formatDobForDisplay, validateAddress, hasMaliciousContent, type AddressValues } from './kycValidation';

describe('security validation edge cases', () => {
  it('rejects XSS in DOB', () => {
    for (const value of ['<script>alert(1)</script>', 'javascript:alert(1)', '%3Cscript%3E']) {
      expect(validateDobFormat(value).valid).toBe(false);
    }
  });

  it('rejects SQL injection in DOB', () => {
    expect(validateDobFormat("'; DROP TABLE users;--").valid).toBe(false);
  });

  it('escapes malicious input in DOB display', () => {
    expect(formatDobForDisplay('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(formatDobForDisplay('"><img src=x onerror=alert(1)>')).toBe('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });

  it('detects XSS and SQL attack patterns', () => {
    expect(hasMaliciousContent('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
    expect(hasMaliciousContent('JaVaScRiPt:alert(1)')).toBe(true);
    expect(hasMaliciousContent("1 OR 1=1")).toBe(true);
    expect(hasMaliciousContent("admin' --")).toBe(true);
    expect(hasMaliciousContent('Springfield IL')).toBe(false);
  });

  it('rejects malicious address fields', () => {
    const valid: AddressValues = { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' };
    expect(validateAddress({ ...valid, street: '<script>x</script>' }).street).toBe('Street address contains invalid characters');
    expect(validateAddress({ ...valid, city: "'; DROP TABLE users;--" }).city).toBe('City contains invalid characters');
    expect(validateAddress({ ...valid, state: '<svg/onload=alert(1)>' }).state).toBe('State / Province contains invalid characters');
    expect(validateAddress({ ...valid, zip: "1 UNION SELECT" }).zip).toBe('ZIP / Postal code contains invalid characters');
    expect(validateAddress({ ...valid, country: '"><img src=x onerror=alert(1)>' }).country).toBe('Country contains invalid characters');
  });
});
