/** Parse the chain journey's USD display without accepting empty or malformed values. */
export function parseUsdcAmount(text: string | undefined): number | null {
  const amount = text?.trim()
  if (!amount || !/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(amount)) return null
  const value = Number(amount.replace(/[$,]/g, ''))
  return Number.isFinite(value) ? value : null
}
