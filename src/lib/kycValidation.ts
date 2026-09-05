/**
 * KYC validation helpers. DOB must be valid calendar date,
 * not in future, and user must be at least 18.
 * Accepts MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD.
 */
export interface DobValidationResult {
  valid: boolean
  error?: string
}

const DATE_REGEXES = [
  /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(19|20)\d{2}$/, //MM/DD/YYYY
  /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-(19|20)\d{2}$/, //MM-DD-YYYY
  /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/, //YYYY-MM-DD
];

export const KYC_CONFIG = {
  MIN_AGE: 18,
  MAX_AGE: 120,
  YEAR_LENGTH: 4,
};

/**
 * Checks if a string contains common XSS or SQL injection patterns.
 * Used to reject malicious input in form fields.
 */
export function hasMaliciousContent(value: string): boolean {
  const htmlTag = /<[^>]*>/i;
  const jsProtocol = /javascript\s*:/i;
  const eventHandler = /(?:\s|^)on\w+\s*=/i;
  const htmlEntity = /&(?:lt|gt|#0*60|#0*62|#x0*3[cCE]|#x0*3[eE]);/i;
  const sqlInjection =
    /([';]\s*--)|(;\s*(?:drop|delete|insert|update|select)\s)|(\b(?:union)\b.*\b(?:select|all)\b)|(\b\d+\s+or\s+\d+=\d+\b)/i;
  return htmlTag.test(value) || jsProtocol.test(value) || eventHandler.test(value) || htmlEntity.test(value) || sqlInjection.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

export function validateDobFormat(value: string): DobValidationResult {
  const trimmed = value.trim()
  if (!trimmed) return { valid: false, error: 'Date of birth is required' }
  const matches = DATE_REGEXES.some((r) => r.test(trimmed))
  if (!matches) return { valid: false, error: 'Use MM/DD/YYYY, MM-DD-YYYY or YYYY-MM-DD' }
  const parsed = parseDob(trimmed)
  if (!parsed) return { valid: false, error: 'Invalid date' }
  const { year, month, day } = parsed
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { valid: false, error: `Invalid calendar date: ${trimmed}` }
  }
  if (date > new Date()) return { valid: false, error: 'Date cannot be in the future' }
  const age = getAge(date)
  if (age < KYC_CONFIG.MIN_AGE)
    return { valid: false, error: `You must be at least ${KYC_CONFIG.MIN_AGE} years old` }
  if (age > KYC_CONFIG.MAX_AGE) return { valid: false, error: 'Please check the year' }
  return { valid: true }
}
function parseDob(value: string): { year: number; month: number; day: number } | null {
  const slash = value.includes('/')
  const dash = value.includes('-')
  if (slash) {
    const [m, d, y] = value.split('/').map(Number)
    if (!m || !d || !y) return null
    return { year: y, month: m, day: d }
  }
  if (dash) {
    const parts = value.split('-')
    if (parts[0].length === KYC_CONFIG.YEAR_LENGTH) {
      const [y, m, d] = parts.map(Number)
      return { year: y, month: m, day: d }
    } else {
      const [m, d, y] = parts.map(Number)
      return { year: y, month: m, day: d }
    }
  }
  return null
}
function getAge(dob: Date): number {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}
export function formatDobForDisplay(value: string): string {
  const trimmed = value.trim();
  const parsed = parseDob(trimmed);
  if (!parsed) return escapeHtml(trimmed);
  const { year, month, day } = parsed;
  return `${String(month).padStart(2, "0") }/${String(day).padStart(2, "0") }/${year}`;
}
export interface AddressValues {
  street: string
  city: string
  state: string
  zip: string
  country: string
  apartment?: string
}
export type AddressErrors = Partial<Record<keyof AddressValues, string>>;

/**
 * Validates address fields according to KYC requirements (#414).
 * Single source of truth shared between component and schema.
 * Rejects input that contains XSS or SQL injection patterns.
 */
export function validateAddress(values: AddressValues): AddressErrors {
  const errors: AddressErrors = {};
  const trim = (s: string) => s.trim();
  const street = trim(values.street);
  const city = trim(values.city);
  const state = trim(values.state);
  const zip = trim(values.zip);
  const country = trim(values.country);
  const apartment = values.apartment ? trim(values.apartment) : '';

  if (!street) errors.street = "Street address is required";
  if (!city) errors.city = "City is required";
  if (!state) errors.state = "State is required";
  if (!zip) errors.zip = "ZIP code is required";
  if (!country) errors.country = "Country is required";

  if (street && hasMaliciousContent(street)) errors.street = "Street address contains invalid characters";
  if (city && hasMaliciousContent(city)) errors.city = "City contains invalid characters";
  if (state && hasMaliciousContent(state)) errors.state = "State / Province contains invalid characters";
  if (zip && hasMaliciousContent(zip)) errors.zip = "ZIP / Postal code contains invalid characters";
  if (country && hasMaliciousContent(country)) errors.country = "Country contains invalid characters";
  if (apartment && hasMaliciousContent(apartment)) errors.apartment = "Apartment contains invalid characters";

  return errors;
}
export const ALLOWED_DOCUMENT_TYPES = ["image/jpeg", "application/pdf"];
export const ALLOWED_DOCUMENT_EXTENSIONS = ["jpg", "jpeg", "pdf"];