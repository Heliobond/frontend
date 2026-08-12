
/**
 * Portfolio risk score (issue #302).
 * Weighted aggregation of bond ratings to a 0-100 score with a label.
 */
export type BondRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "C";

const RATING_SCORE: Record<BondRating, number> = {
  AAA: 5,
  AA: 15,
  A: 30,
  BBB: 45,
  BB: 65,
  B: 85,
  C: 100,
};

export interface RiskHolding {
  rating: BondRating;
  weight: number;
}

export interface RiskResult {
  score: number;
  label: "Low" | "Moderate" | "High" | "Very High";
}

export function portfolioRiskScore(holdings: RiskHolding[]): RiskResult {
  const totalWeight = holdings.reduce((sum, h) => sum + h.weight, 0);
  if (totalWeight <= 0) {
    return { score: 0, label: "Low" };
  }
  const weighted = holdings.reduce(
    (sum, h) => sum + RATING_SCORE[h.rating] * h.weight,
    0,
  );
  const score = Math.round(weighted / totalWeight);

  let label: RiskResult["label"];
  if (score <= 25) label = "Low";
  else if (score <= 50) label = "Moderate";
  else if (score <= 75) label = "High";
  else label = "Very High";

  return { score, label };
}
