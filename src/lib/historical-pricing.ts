
/**
 * Historical pricing helpers (issue #299).
 * Transforms raw price series into shapes consumed by the existing
 * Sparkline component and computes trend + change summaries.
 */
export interface PricePoint {
  timestamp: number;
  price: number;
}

export function toSparkline(points: PricePoint[]): number[] {
  return points.map((p) => p.price);
}

export function percentChange(points: PricePoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0].price;
  const last = points[points.length - 1].price;
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

export type Trend = "up" | "down" | "flat";

export function computeTrend(points: PricePoint[]): Trend {
  const change = percentChange(points);
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "flat";
}

export function bucketByDay(points: PricePoint[]): PricePoint[] {
  const byDay = new Map<string, PricePoint>();
  for (const p of points) {
    const day = new Date(p.timestamp).toISOString().slice(0, 10);
    const existing = byDay.get(day);
    if (!existing || p.timestamp > existing.timestamp) {
      byDay.set(day, p);
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.timestamp - b.timestamp);
}
