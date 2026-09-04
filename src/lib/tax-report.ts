// src/lib/tax-report.ts
//
// Groups investment activity into quarters and computes taxable gains
// for export. This is a simplified illustrative model, not tax advice:
// realized gain on a withdrawal/distribution = amount - cost basis
// allocated to that event. Deposits establish cost basis and are not
// themselves taxable events.

export type InvestmentEventType = "deposit" | "withdrawal" | "distribution";

export interface InvestmentEvent {
  id: string;
  projectName: string;
  /** ISO 8601 date string, e.g. "2025-03-14" */
  date: string;
  type: InvestmentEventType;
  amountUSD: number;
  /** Cost basis allocated to this event. 0/undefined for deposits. */
  costBasisUSD?: number;
}

export interface QuarterlyTaxLine {
  quarter: string; // e.g. "2025-Q1"
  year: number;
  quarterNumber: 1 | 2 | 3 | 4;
  totalDeposits: number;
  totalWithdrawals: number;
  totalDistributions: number;
  realizedGainUSD: number;
  events: InvestmentEvent[];
}

export function getQuarter(dateStr: string): { year: number; quarterNumber: 1 | 2 | 3 | 4 } {
  const date = new Date(dateStr);
  const month = date.getUTCMonth(); // 0-11
  const quarterNumber = (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
  return { year: date.getUTCFullYear(), quarterNumber };
}

function realizedGain(event: InvestmentEvent): number {
  if (event.type === "deposit") return 0;
  return event.amountUSD - (event.costBasisUSD ?? 0);
}

export function computeQuarterlyTaxReport(events: InvestmentEvent[]): QuarterlyTaxLine[] {
  const byQuarter = new Map<string, QuarterlyTaxLine>();

  for (const event of events) {
    const { year, quarterNumber } = getQuarter(event.date);
    const key = `${year}-Q${quarterNumber}`;

    if (!byQuarter.has(key)) {
      byQuarter.set(key, {
        quarter: key,
        year,
        quarterNumber,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalDistributions: 0,
        realizedGainUSD: 0,
        events: [],
      });
    }

    const line = byQuarter.get(key)!;
    line.events.push(event);

    if (event.type === "deposit") line.totalDeposits += event.amountUSD;
    if (event.type === "withdrawal") line.totalWithdrawals += event.amountUSD;
    if (event.type === "distribution") line.totalDistributions += event.amountUSD;

    line.realizedGainUSD += realizedGain(event);
  }

  return Array.from(byQuarter.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.quarterNumber - b.quarterNumber
  );
}

export function quarterlyReportToCsv(lines: QuarterlyTaxLine[]): string {
  const header = [
    "Quarter",
    "Total Deposits (USD)",
    "Total Withdrawals (USD)",
    "Total Distributions (USD)",
    "Realized Gain (USD)",
  ].join(",");

  const rows = lines.map((line) =>
    [
      line.quarter,
      line.totalDeposits.toFixed(2),
      line.totalWithdrawals.toFixed(2),
      line.totalDistributions.toFixed(2),
      line.realizedGainUSD.toFixed(2),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}