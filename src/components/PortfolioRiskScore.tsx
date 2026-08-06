import { useMemo } from 'react';

type BondRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'CC' | 'C' | 'D';

interface BondHolding {
  symbol: string;
  rating: BondRating;
  weight: number;
  yield: number;
  maturity: string;
}

const RATING_SCORES: Record<BondRating, number> = {
  AAA: 1, AA: 2, A: 3, BBB: 5, BB: 8, B: 12, CCC: 18, CC: 25, C: 35, D: 50,
};

function calcPortfolioRisk(holdings: BondHolding[]) {
  if (!holdings.length) return { score: 0, tier: 1, contributions: [] as any[] };
  const contributions = holdings.map(h => ({
    symbol: h.symbol,
    rating: h.rating,
    weight: h.weight,
    score: RATING_SCORES[h.rating],
    contribution: (RATING_SCORES[h.rating] * h.weight) / 100,
  }));
  const weightedSum = contributions.reduce((s, c) => s + c.contribution, 0);
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  const score = Math.round(rawScore);
  let tier = 1;
  if (score > 50) tier = 5;
  else if (score > 25) tier = 4;
  else if (score > 12) tier = 3;
  else if (score > 5) tier = 2;
  return { score, tier, contributions };
}

const TIERS: Record<number, { label: string; color: string }> = {
  1: { label: 'Very Low Risk', color: '#22c55e' },
  2: { label: 'Low Risk', color: '#84cc16' },
  3: { label: 'Moderate Risk', color: '#eab308' },
  4: { label: 'Elevated Risk', color: '#f97316' },
  5: { label: 'High Risk', color: '#ef4444' },
};

export default function PortfolioRiskScore({ holdings }: { holdings: BondHolding[] }) {
  const { score, tier, contributions } = useMemo(() => calcPortfolioRisk(holdings), [holdings]);
  const t = TIERS[tier];
  if (!holdings.length) return <div className="text-gray-500 italic">No bond holdings to analyze.</div>;
  return (
    <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Portfolio Risk Score</h3>
        <span className="px-3 py-1 rounded-full text-sm font-medium text-white" style={{ background: t.color }}>
          {score}
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-3">{t.label} — Weighted score from bond ratings mix</p>
      <div className="space-y-1.5">
        {contributions.map(c => (
          <div key={c.symbol} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{c.symbol}</span>
              <span className="text-gray-500 text-xs">({c.rating})</span>
            </span>
            <span className="text-gray-600 text-xs">
              {c.weight}% weight — {c.contribution.toFixed(1)} risk pts
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
