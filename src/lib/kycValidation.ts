/**
 * KYC validation helpers. DOB must be valid calendar date,
 * not in future, and user must be at least 18.
 * Accepts MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD.
 */
export interface DobValidationResult {
  valid: boolean
  error?: string
}

/** KYC policy constants shared by the DOB validators. */
const KYC_CONFIG = {
  /** Minimum investor age, in years. */
  MIN_AGE: 18,
  /** Maximum plausible age, in years — anything above is a data-entry error. */
  MAX_AGE: 120,
  /** Length of a leading YYYY year segment. */
  YEAR_LENGTH: 4,
}

const DATE_REGEXES = [
  /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(19|20)\d{2}$/, //MM/DD/YYYY
  /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-(19|20)\d{2}$/, //MM-DD-YYYY
  /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/, //YYYY-MM-DD
]

/**
 * Checks if a string contains common XSS or SQL injection patterns.
 * Used to reject malicious input in form fields.
 */
export function hasMaliciousContent(value: string): boolean {
  const htmlTag = /<[^>]*>/i
  const jsProtocol = /javascript\s*:/i
  const eventHandler = /(?:\s|^)on\w+\s*=/i
  const htmlEntity = /&(?:lt|gt|#0*60|#0*62|#x0*3[cCE]|#x0*3[eE]);/i
  const sqlInjection =
    /(['<g;]\s*--)|(;\s*(?:drop|delete|insert|update|select)\s)|(\b(?:union)\b.*\b(?:select|all|from)\b)|(\/\.*\/)|(\b(?:or|and)\b\s*[\d'"])|(\bunion\b)|(\bselect\b\s+[\w*]+\s+\bfrom\b)/i
  return (
    htmlTag.test(value) ||
    jsProtocol.test(value) ||
    eventHandler.test(value) ||
    htmlEntity.test(value) ||
    sqlInjection.test(value)
  )
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return c
    }
  })
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
  const trimmed = value.trim()
  const parsed = parseDob(trimmed)
  if (!parsed) return escapeHtml(trimmed)
  const { year, month, day } = parsed
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
}
export interface AddressValues {
  street: string
  city: string
  state: string
  zip: string
  country: string
  apartment?: string
}
type AddressField = keyof AddressValues
type RequiredAddressField = Exclude<AddressField, 'apartment'>

/** Message keys under the `Kyc.errors` namespace; the form translates them (#867). */
export type AddressErrorKey =
  `${RequiredAddressField}Required` | `${AddressField}Invalid` | 'stateFormat' | 'zipFormat'

export type AddressErrors = Partial<Record<AddressField, AddressErrorKey>>

const ADDRESS_FIELDS: readonly AddressField[] = [
  'street',
  'city',
  'state',
  'zip',
  'country',
  'apartment',
]

/**
 * Postal code shape per ISO 3166-1 country (#871), matched against the trimmed,
 * upper-cased input:
 * - US: USPS ZIP (5 digits) or ZIP+4 (9 digits, hyphen optional).
 * - CA: Canada Post `A9A 9A9`; D, F, I, O, Q, U never appear, W and Z never lead.
 * - GB: Royal Mail outward codes A9, A99, AA9, AA99, A9A, AA9A with their
 *   per-position letter limits, then the inward code `9AA` (no C, I, K, M, O, V).
 * - DE: 5-digit Postleitzahl. FR: 5-digit code postal.
 */
const POSTAL_CODE_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  ['US', /^\d{5}(?:-?\d{4})?$/],
  ['CA', /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/],
  ['GB', /^[A-PR-UWYZ](?:\d[A-HJKPSTUW\d]?|[A-HK-Y]\d[ABEHMNPRV-Y\d]?) ?\d[ABD-HJLNP-UW-Z]{2}$/],
  ['DE', /^\d{5}$/],
  ['FR', /^\d{5}$/],
])

/**
 * Two-letter subdivision codes for countries whose addresses require one (#871):
 * USPS Publication 28 Appendix B (states, DC, possessions, freely associated
 * states, military AA/AE/AP) and Canada Post province / territory symbols.
 */
const SUBDIVISION_CODES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    'US',
    new Set(
      'AL AK AS AZ AR CA CO CT DE DC FM FL GA GU HI ID IL IN IA KS KY LA ME MH MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND MP OH OK OR PW PA PR RI SC SD TN TX UT VT VI VA WA WV WI WY AA AE AP'.split(
        ' ',
      ),
    ),
  ],
  ['CA', new Set('AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '))],
])

const ADDRESS_MAX_LENGTH = 200
const ADDRESS_ALLOWED_CHARACTERS = /^[\p{L}\p{M}\p{N}\s,./#'&-]+$/u

/** Addresses are validated by shape; database safety belongs to parameterized backend queries. */
export function hasInvalidAddressCharacters(value: string): boolean {
  return (
    value.length > ADDRESS_MAX_LENGTH ||
    /[\u0000-\u001f\u007f<>]/u.test(value) ||
    !ADDRESS_ALLOWED_CHARACTERS.test(value)
  )
}

/**
 * Validates address fields according to KYC requirements (#414).
 * Single source of truth shared between component and schema.
 * Rejects input that contains XSS or SQL injection patterns, then checks the
 * ZIP and state shape for countries with a known format (#871). Returns
 * `Kyc.errors` message keys rather than display text (#867).
 *
 * O(n) time in the total input length; lookups are O(1) map / set hits.
 */
export function validateAddress(values: AddressValues): AddressErrors {
  const errors: AddressErrors = {}

  for (const field of ADDRESS_FIELDS) {
    const value = (values[field] ?? '').trim()
    if (!value) {
      if (field !== 'apartment') errors[field] = `${field}Required`
    } else if (hasInvalidAddressCharacters(value)) {
      errors[field] = `${field}Invalid`
    }
  }

  const country = values.country.trim().toUpperCase()
  const state = values.state.trim().toUpperCase()
  const zip = values.zip.trim().toUpperCase()
  const subdivisions = SUBDIVISION_CODES.get(country)
  const postalCode = POSTAL_CODE_PATTERNS.get(country)

  if (!errors.state && subdivisions && !subdivisions.has(state)) errors.state = 'stateFormat'
  if (!errors.zip && postalCode && !postalCode.test(zip)) errors.zip = 'zipFormat'

  return errors
}
