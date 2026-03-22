import { clsx } from "clsx";
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

export function AlbaRevenueTable({ rows }: { rows: AlbaRow[] }) {
  const totalGross = rows.reduce((s, r) => s + r.grossIncome, 0);
  const totalNet = rows.reduce((s, r) => s + r.netProfit, 0);

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="text-left">
            {["Unit", "Type", "Gross", "Commission", "Fixed Costs", "Variable", "Net", "Nights"].map((h) => (
              <th key={h} className="pb-2 pr-3 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans last:text-center">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const occ = row.daysInMonth > 0 ? Math.round((row.bookedNights / row.daysInMonth) * 100) : 0;
            return (
              <tr key={row.unitId} className="border-t border-gray-100">
                <td className="py-3 pr-3 text-sm font-mono text-header font-medium">{row.unitNumber}</td>
                <td className="py-3 pr-3 text-sm font-sans text-gray-500">{row.type === "ONE_BED" ? "1 Bed" : "2 Bed"}</td>
                <td className="py-3 pr-3 text-right"><CurrencyDisplay amount={row.grossIncome} size="sm" colorize /></td>
                <td className="py-3 pr-3 text-right"><CurrencyDisplay amount={-row.totalCommissions} size="sm" colorize /></td>
                <td className="py-3 pr-3 text-right"><CurrencyDisplay amount={-row.fixedExpenses} size="sm" colorize /></td>
                <td className="py-3 pr-3 text-right"><CurrencyDisplay amount={-row.variableExpenses} size="sm" colorize /></td>
                <td className="py-3 pr-3 text-right"><CurrencyDisplay amount={row.netProfit} size="sm" colorize /></td>
                <td className="py-3 text-center">
                  {row.grossIncome === 0 ? (
                    <Badge variant={row.status === "OWNER_OCCUPIED" ? "gold" : "gray"}>
                      {row.status === "OWNER_OCCUPIED" ? "Owner" : "Vacant"}
                    </Badge>
                  ) : (
                    <span className="text-sm font-mono text-gray-600">{row.bookedNights}n <span className="text-gray-400 text-xs">({occ}%)</span></span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gold/30">
            <td colSpan={2} className="pt-3 text-sm font-medium font-sans text-header">Total</td>
            <td className="pt-3 text-right"><CurrencyDisplay amount={totalGross} size="sm" colorize /></td>
            <td colSpan={3} />
            <td className="pt-3 text-right"><CurrencyDisplay amount={totalNet} size="sm" colorize /></td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
