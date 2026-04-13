import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Badge } from "@/components/ui/Badge";

interface AlbaRow {
  unitId: string;
  unitNumber: string;
  type: string;
  status: string;
  grossIncome: number;
  totalCommissions: number;
  fixedExpenses: number;
  variableExpenses: number;
  netProfit: number;
  bookedNights: number;
  daysInMonth: number;
}

function unitTypeLabel(type: string) {
  const map: Record<string, string> = {
    BEDSITTER:  "Studio",
    ONE_BED:    "1 Bed",
    TWO_BED:    "2 Bed",
    THREE_BED:  "3 Bed",
    FOUR_BED:   "4 Bed",
    PENTHOUSE:  "Penthouse",
    COMMERCIAL: "Commercial",
  };
  return map[type] ?? type;
}

export function AlbaRevenueTable({ rows, currency = "USD" }: { rows: AlbaRow[]; currency?: string }) {
  const totalGross = rows.reduce((s, r) => s + r.grossIncome, 0);
  const totalNet   = rows.reduce((s, r) => s + r.netProfit, 0);

  return (
    <>
      {/* ── Mobile: stacked cards (no horizontal scroll) ─────────────────── */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          const occ = row.daysInMonth > 0 ? Math.round((row.bookedNights / row.daysInMonth) * 100) : 0;
          return (
            <div key={row.unitId} className="rounded-xl border border-gray-100 bg-white p-3">
              {/* Unit + occupancy badge */}
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <p className="font-sans font-medium text-sm text-header leading-tight">
                    Unit {row.unitNumber}
                  </p>
                  <p className="text-xs text-gray-400 font-sans mt-0.5">{unitTypeLabel(row.type)}</p>
                </div>
                {row.grossIncome === 0 ? (
                  <Badge variant={row.status === "OWNER_OCCUPIED" ? "gold" : "gray"}>
                    {row.status === "OWNER_OCCUPIED" ? "Owner" : "Vacant"}
                  </Badge>
                ) : (
                  <span className="text-sm font-mono text-gray-600">
                    {row.bookedNights}n{" "}
                    <span className="text-gray-400 text-xs">({occ}%)</span>
                  </span>
                )}
              </div>

              {/* Financials grid */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
                <div>
                  <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Gross</p>
                  <CurrencyDisplay currency={currency} amount={row.grossIncome} size="sm" colorize />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Net</p>
                  <CurrencyDisplay currency={currency} amount={row.netProfit} size="sm" colorize />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Commission</p>
                  <CurrencyDisplay currency={currency} amount={-row.totalCommissions} size="sm" colorize />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Expenses</p>
                  <CurrencyDisplay currency={currency} amount={-(row.fixedExpenses + row.variableExpenses)} size="sm" colorize />
                </div>
              </div>
            </div>
          );
        })}

        {/* Totals card */}
        <div className="rounded-xl border border-gold/25 bg-cream p-3">
          <p className="text-xs font-medium text-header font-sans mb-2">Totals</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Gross</p>
              <CurrencyDisplay currency={currency} amount={totalGross} size="sm" colorize />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Net</p>
              <CurrencyDisplay currency={currency} amount={totalNet} size="sm" colorize />
            </div>
          </div>
        </div>
      </div>

      {/* ── Desktop: scrollable table with sticky header ──────────────────── */}
      <div className="hidden md:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
          <table className="w-full min-w-[640px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-left">
                {["Unit", "Type", "Gross", "Commission", "Fixed Costs", "Variable", "Net", "Nights"].map((h) => (
                  <th key={h} className="pb-2 pr-3 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans last:text-center">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const occ = row.daysInMonth > 0 ? Math.round((row.bookedNights / row.daysInMonth) * 100) : 0;
                return (
                  <tr key={row.unitId} className="border-t border-gray-100">
                    <td className="py-3 pr-3 text-sm font-mono text-header font-medium">{row.unitNumber}</td>
                    <td className="py-3 pr-3 text-sm font-sans text-gray-500">{unitTypeLabel(row.type)}</td>
                    <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={row.grossIncome} size="sm" colorize /></td>
                    <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={-row.totalCommissions} size="sm" colorize /></td>
                    <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={-row.fixedExpenses} size="sm" colorize /></td>
                    <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={-row.variableExpenses} size="sm" colorize /></td>
                    <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={row.netProfit} size="sm" colorize /></td>
                    <td className="py-3 text-center">
                      {row.grossIncome === 0 ? (
                        <Badge variant={row.status === "OWNER_OCCUPIED" ? "gold" : "gray"}>
                          {row.status === "OWNER_OCCUPIED" ? "Owner" : "Vacant"}
                        </Badge>
                      ) : (
                        <span className="text-sm font-mono text-gray-600">
                          {row.bookedNights}n <span className="text-gray-400 text-xs">({occ}%)</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-gold/30">
                <td colSpan={2} className="pt-3 text-sm font-medium font-sans text-header">Total</td>
                <td className="pt-3 text-right"><CurrencyDisplay currency={currency} amount={totalGross} size="sm" colorize /></td>
                <td colSpan={3} />
                <td className="pt-3 text-right"><CurrencyDisplay currency={currency} amount={totalNet} size="sm" colorize /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
