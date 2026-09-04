"use client";

import { useState } from "react";
import {
  computeQuarterlyTaxReport,
  quarterlyReportToCsv,
  downloadCsv,
  type InvestmentEvent,
} from "@/lib/tax-report";

// TODO: replace with the real investor history source (likely something in
// `src/data.ts` / `src/data/`, or the wallet/vault service) once wired up.
// Kept local and clearly-marked so this screen renders correctly today
// without depending on data shapes elsewhere in the app.
const PLACEHOLDER_EVENTS: InvestmentEvent[] = [
  { id: "1", projectName: "Solar Farm A", date: "2025-01-10", type: "deposit", amountUSD: 1000 },
  { id: "2", projectName: "Solar Farm A", date: "2025-02-14", type: "distribution", amountUSD: 45, costBasisUSD: 0 },
  { id: "3", projectName: "Wind Co B", date: "2025-04-05", type: "deposit", amountUSD: 500 },
  { id: "4", projectName: "Solar Farm A", date: "2025-07-22", type: "withdrawal", amountUSD: 300, costBasisUSD: 250 },
  { id: "5", projectName: "Wind Co B", date: "2025-10-11", type: "distribution", amountUSD: 30, costBasisUSD: 0 },
];

export function TaxReports() {
  const [report] = useState(() => computeQuarterlyTaxReport(PLACEHOLDER_EVENTS));

  function handleExport() {
    const csv = quarterlyReportToCsv(report);
    downloadCsv(`heliobond-quarterly-tax-report-${new Date().getFullYear()}.csv`, csv);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quarterly Tax Reports</h1>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md bg-[var(--color-accent,#2563eb)] px-4 py-2 text-sm font-medium text-white"
        >
          Export CSV
        </button>
      </div>

      <p className="text-sm text-[var(--color-muted,#6b7280)]">
        This is an illustrative summary for record-keeping, not tax advice.
        Consult a tax professional for your filing.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b px-3 py-2 text-left font-medium">Quarter</th>
              <th className="border-b px-3 py-2 text-right font-medium">Deposits</th>
              <th className="border-b px-3 py-2 text-right font-medium">Withdrawals</th>
              <th className="border-b px-3 py-2 text-right font-medium">Distributions</th>
              <th className="border-b px-3 py-2 text-right font-medium">Realized Gain</th>
            </tr>
          </thead>
          <tbody>
            {report.map((line) => (
              <tr key={line.quarter}>
                <td className="border-b px-3 py-2">{line.quarter}</td>
                <td className="border-b px-3 py-2 text-right">${line.totalDeposits.toFixed(2)}</td>
                <td className="border-b px-3 py-2 text-right">${line.totalWithdrawals.toFixed(2)}</td>
                <td className="border-b px-3 py-2 text-right">${line.totalDistributions.toFixed(2)}</td>
                <td className="border-b px-3 py-2 text-right">${line.realizedGainUSD.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}