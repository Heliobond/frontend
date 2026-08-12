
/**
 * Rate-of-return calculator (issue #295).
 * Pure, dependency-free helpers for the bond detail page.
 */

/** Simple total return as a percentage. */
export function simpleReturn(principal: number, currentValue: number): number {
  if (principal <= 0) return 0;
  return ((currentValue - principal) / principal) * 100;
}

/** Compound annual growth rate (CAGR). */
export function annualizedReturn(
  principal: number,
  currentValue: number,
  years: number,
): number {
  if (principal <= 0 || years <= 0) return 0;
  const ratio = currentValue / principal;
  if (ratio <= 0) return 0;
  return (Math.pow(ratio, 1 / years) - 1) * 100;
}

/** Approximate yield-to-maturity for a fixed-coupon bond. */
export function approximateYieldToMaturity(input: {
  faceValue: number;
  marketPrice: number;
  couponRate: number;
  yearsToMaturity: number;
}): number {
  const { faceValue, marketPrice, couponRate, yearsToMaturity } = input;
  if (marketPrice <= 0 || yearsToMaturity <= 0) return 0;
  const annualCoupon = faceValue * (couponRate / 100);
  const capitalGain = (faceValue - marketPrice) / yearsToMaturity;
  const averagePrice = (faceValue + marketPrice) / 2;
  if (averagePrice <= 0) return 0;
  return ((annualCoupon + capitalGain) / averagePrice) * 100;
}

/** Future value of a recurring investment. */
export function futureValueRecurring(input: {
  monthlyContribution: number;
  annualRate: number;
  months: number;
}): number {
  const { monthlyContribution, annualRate, months } = input;
  if (months <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return monthlyContribution * months;
  const factor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
  return monthlyContribution * factor;
}
