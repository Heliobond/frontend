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
 * Formats the vault share price with the shared precision used everywhere
 * the figure appears (deposit preview, admin stat cell, data source) so the
 * same value reads identically across screens (#394).
 */
export function formatSharePrice(value: number): string {
  return formatDecimal(value, 4)
}

/**
 * Maps application locales to their corresponding JavaScript locale codes
 * for proper number and currency formatting (#462).
 */
export function getLocaleCode(appLocale?: string): string {
  const localeMap: Record<string, string> = {
    en: 'en-US',
    fr: 'fr-FR',
    es: 'es-ES',
    ar: 'ar-SA',
    pt: 'pt-BR',
  }
  return localeMap[appLocale ?? 'en'] ?? 'en-US'
}

/**
 * Maps application locales to their default currency codes for proper
 * symbol formatting in Intl.NumberFormat (#462).
 */
export function getCurrencyCode(_appLocale?: string): string {
  // The app displays USD prices regardless of locale,
  // but uses locale-appropriate number formatting and symbols
  return 'USD'
}

/**
 * Formats a number as a localized currency/money string using the app's
 * locale configuration. Uses Intl.NumberFormat for proper currency symbol
 * placement according to locale conventions (#462).
 */
export function formatMoney(
  amount: number,
  options?: {
    includeSymbol?: boolean
    symbol?: string
    locale?: string
    appLocale?: string // The app's current locale (en, fr, es, ar, pt)
  },
): string {
  const localeCode = getLocaleCode(options?.appLocale)
  
  // If using Intl.NumberFormat with currency
  if (options?.includeSymbol && !options?.symbol) {
    try {
      const formatted = new Intl.NumberFormat(localeCode, {
        style: 'currency',
        currency: getCurrencyCode(options?.appLocale),
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount)
      return formatted
    } catch {
      // Fallback if Intl.NumberFormat fails
      const formatted = amount.toLocaleString(localeCode, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
      return `$${formatted}`
    }
  }
  
  // For backward compatibility with existing code that passes explicit symbol
  const formatted = amount.toLocaleString(options?.locale ?? localeCode, {
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

/** Data shape for the landing pool counters. */
export interface PoolData {
  totalAssets: number
  projectsFunded: number
  projectedRate: number
}

/**
 * Formats the landing pool counters from the source data.
 * This drives the live counters from the flat `selectPoolSummary()` selector
 * (the `HB_DATA.pool` branch) rather than hardcoded strings, preventing drift
 * from the data source.
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
