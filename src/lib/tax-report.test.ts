// src/lib/tax-report.test.ts
import { describe, it, expect } from "vitest";
import {
  computeQuarterlyTaxReport,
  quarterlyReportToCsv,
  getQuarter,
  type InvestmentEvent,
} from "./tax-report";

describe("getQuarter", () => {
  it("maps January to Q1", () => {
    expect(getQuarter("2025-01-15")).toEqual({ year: 2025, quarterNumber: 1 });
  });
  it("maps March 31 (boundary) to Q1", () => {
    expect(getQuarter("2025-03-31")).toEqual({ year: 2025, quarterNumber: 1 });
  });
  it("maps April 1 (boundary) to Q2", () => {
    expect(getQuarter("2025-04-01")).toEqual({ year: 2025, quarterNumber: 2 });
  });
  it("maps December 31 to Q4", () => {
    expect(getQuarter("2025-12-31")).toEqual({ year: 2025, quarterNumber: 4 });
  });
});

describe("computeQuarterlyTaxReport", () => {
  const events: InvestmentEvent[] = [
    { id: "1", projectName: "Solar Farm A", date: "2025-01-10", type: "deposit", amountUSD: 1000 },
    { id: "2", projectName: "Solar Farm A", date: "2025-02-01", type: "distribution", amountUSD: 50, costBasisUSD: 0 },
    { id: "3", projectName: "Solar Farm A", date: "2025-04-05", type: "withdrawal", amountUSD: 600, costBasisUSD: 500 },
    { id: "4", projectName: "Wind Co B", date: "2025-04-20", type: "deposit", amountUSD: 300 },
  ];

  it("groups events into the correct quarters", () => {
    const report = computeQuarterlyTaxReport(events);
    expect(report.map((l) => l.quarter)).toEqual(["2025-Q1", "2025-Q2"]);
  });

  it("sums deposits, withdrawals, and distributions per quarter", () => {
    const report = computeQuarterlyTaxReport(events);
    const q1 = report.find((l) => l.quarter === "2025-Q1")!;
    expect(q1.totalDeposits).toBe(1000);
    expect(q1.totalDistributions).toBe(50);

    const q2 = report.find((l) => l.quarter === "2025-Q2")!;
    expect(q2.totalWithdrawals).toBe(600);
    expect(q2.totalDeposits).toBe(300);
  });

  it("computes realized gain: deposits contribute 0, distributions/withdrawals net cost basis", () => {
    const report = computeQuarterlyTaxReport(events);
    const q1 = report.find((l) => l.quarter === "2025-Q1")!;
    expect(q1.realizedGainUSD).toBe(50); // distribution only, no cost basis

    const q2 = report.find((l) => l.quarter === "2025-Q2")!;
    expect(q2.realizedGainUSD).toBe(100); // 600 - 500 cost basis, deposit contributes 0
  });

  it("returns an empty array for no events", () => {
    expect(computeQuarterlyTaxReport([])).toEqual([]);
  });

  it("sorts multi-year results chronologically", () => {
    const multiYear: InvestmentEvent[] = [
      { id: "a", projectName: "X", date: "2026-01-05", type: "deposit", amountUSD: 100 },
      { id: "b", projectName: "X", date: "2025-11-01", type: "deposit", amountUSD: 100 },
    ];
    const report = computeQuarterlyTaxReport(multiYear);
    expect(report.map((l) => l.quarter)).toEqual(["2025-Q4", "2026-Q1"]);
  });
});

describe("quarterlyReportToCsv", () => {
  it("produces a header row plus one row per quarter", () => {
    const events: InvestmentEvent[] = [
      { id: "1", projectName: "Solar Farm A", date: "2025-01-10", type: "deposit", amountUSD: 1000 },
    ];
    const csv = quarterlyReportToCsv(computeQuarterlyTaxReport(events));
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "Quarter,Total Deposits (USD),Total Withdrawals (USD),Total Distributions (USD),Realized Gain (USD)"
    );
    expect(lines[1]).toBe("2025-Q1,1000.00,0.00,0.00,0.00");
  });
});