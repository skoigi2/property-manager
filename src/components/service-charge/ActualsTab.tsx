"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/currency";
import { exportServiceCharge } from "@/lib/excel-export";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-categories";
import type { ServiceChargeView } from "@/lib/service-charge-data";

const label = (c: string) => (EXPENSE_CATEGORY_LABELS as Record<string, string>)[c] ?? c;

/** Budget vs actual per cost, with the budget pro-rated to today. */
export function ActualsTab({ view }: { view: ServiceChargeView }) {
  const fmt = (n: number) => formatCurrency(n, view.property.currency);
  const b = view.budgetVsActual;
  const elapsed = Math.round(b.fractionElapsed * 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Budget for the year", fmt(b.totals.budget)],
          [`Budget to date (${elapsed}% of the year)`, fmt(b.totals.budgetToDate)],
          ["Spent so far", fmt(b.totals.actual)],
          ["Billed to tenants on account", fmt(view.billedOnAccount)],
        ].map(([k, v]) => (
          <Card key={k} padding="sm">
            <p className="text-caption text-gray-500">{k}</p>
            <p className="text-h3 text-header tabular-nums mt-1">{v}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="text-caption text-gray-500">
            Actual = expenses on the <Link href="/expenses" className="text-gold-dark hover:underline">Expenses</Link> page recorded against the property
            (not a single unit) in each category, VAT included. Over budget to date shows in red.
          </p>
          <Button variant="secondary" size="sm" onClick={() => exportServiceCharge(view, label)}>
            <Download size={14} className="mr-1" /> Excel
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="text-left text-caption text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium">Cost</th>
                <th className="py-2 pr-3 font-medium text-right">Budget</th>
                <th className="py-2 pr-3 font-medium text-right">To date</th>
                <th className="py-2 pr-3 font-medium text-right">Actual</th>
                <th className="py-2 pr-3 font-medium text-right">Variance</th>
                <th className="py-2 font-medium w-40">Used</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r) => {
                const pct = r.pctUsed == null ? null : Math.round(r.pctUsed * 100);
                return (
                  <tr key={r.category} className="border-b border-gray-50">
                    <td className="py-2 pr-3">{label(r.category)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.budget)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-500">{fmt(r.budgetToDate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">{fmt(r.actual)}</td>
                    <td className={clsx("py-2 pr-3 text-right tabular-nums", r.variance > 0.005 ? "text-expense font-medium" : "text-income")}>
                      {r.variance > 0 ? "+" : ""}{fmt(r.variance)}
                    </td>
                    <td className="py-2">
                      {pct == null ? (
                        <span className="text-caption text-gray-400">No budget</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={clsx("h-full rounded-full", r.actual > r.budgetToDate + 0.005 ? "bg-red-400" : "bg-gold")}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-caption tabular-nums text-gray-500 w-10 text-right">{pct}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {b.rows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Add the budget&apos;s costs on the Budget tab first.</td></tr>
              )}
            </tbody>
            {b.rows.length > 0 && (
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(b.totals.budget)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(b.totals.budgetToDate)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(b.totals.actual)}</td>
                  <td className={clsx("py-2 pr-3 text-right tabular-nums", b.totals.variance > 0.005 ? "text-expense" : "text-income")}>
                    {b.totals.variance > 0 ? "+" : ""}{fmt(b.totals.variance)}
                  </td>
                  <td className="py-2 text-caption text-gray-500">{b.totals.pctUsed == null ? "" : `${Math.round(b.totals.pctUsed * 100)}% of the year's budget`}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
