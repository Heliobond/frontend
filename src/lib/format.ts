/*
 * Rounds a number to a fixed number of decimals using decimal (not binary
 * floating-point) precision, so 1.005 rounds to 1.01 rather than the 1.00 that
 * `Math.round(1.005 * 100) / 100` or `(1.005).toFixed(2)` produce because
 * 1.005 has no exact binary representation (#369).
 */
export function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/** Rounds to whole cents — the shared precision for on-screen USDC pmounts (#369). */
export function roundToCents(value: number): number {
  return roundToDecimals(value, 2)
}

/**
 * Formats a number to a fixed number of decimals, rounding once with
 * {@link roundToDecimals} first so every caller displays the same rounded
 * value instead of re-rounding raw floating-point results independently (#369).
 */
export function formatDecimal(value: number, decimals: number): string {
  return roundToDecimals(value, decimals).toFixed(decimals)
}


/**
 * Formats a number as a localized currency/money string.
 * Defaults to 'en-US' formatting.
 */
export function formatMoney(
  amount: number,
  options?: {
    includeSymbol: boolean
    symbol?: string
    locale?: string
  },
): string {
  const locale = options?.locale ?? 'en-US'
  const formatted = amount.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  if (options?.includeSymbol) {
    const symbol = options?.symbol ?? '$'
    return `${symbol}${formatted}`
  }
  return formatted
}

/**
 * Sanitizes input strings by removing non-numeric characters except a single decimal point,
 * stripping leading zeros from the whole-number part.
 */
export function sanitizeAmount(val: string): string {
  const clean = val.replace(/[^0-9.]/g, '')
  const parts = clean.split('.')
  const joined = parts.length > 1 ? parts[0] + '.' + parts.slice(1).join('') : clean
  const [whole, ...rest] = joined.split('.')
  const trimmedWhole = whole.replace(/^0+(?=\d)/, '')
  return rest.length > 0 ? trimmedWhole + '.' + rest.join('.') : trimmedWhole
}

/**
 * Parses an investment amount string into a rounded numeric float (2 decimal places).
 * Consolidates parsing logic across forms (#417).
 */
export function parseAmount(value: string): number {
  const cleaned = sanitizeAmount(value)
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : roundToCents(num)
}

/** The shared number of decimals used for on-screen share prices. */
export const SHARE_PRICE_DECIMALS = 4

/** Formats a share price to the shared precision, rounding once. */
export function formatSharePrice(value: number): string {
  return formatDecimal(value, SHARE_PRICE_DECIMALS)
}

/** Data shape for the landing pool counters. */
export interface PoolData {
  totalAssets: number
  projectsFunded: number
  projectedRate: number
}

/**
 * Formats the landing pool counters from the source data.
 * This drives the live counters from `HB_DATA.pool` rather than
 * hardcoded strings, preventing drift from the data source.
 */
export function formatPoolCounters(pool: PoolData): {
  totalAssets: string
  projectsFunded: string
  projectedRate: string
} {
  return {
    totalAssets: formatMoney(pool.totalAssets, { includeSymbol: true }),
    projectsFunded: String(pool.projectsFunded),
    projectedRate: formatDecimal(pool.projectedRate, 1),
  }
}