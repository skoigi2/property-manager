import { clsx } from "clsx";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/date-utils";

interface RentRow {
  id: string;
  tenantName: string;
  unitNumber: string;
  type: string;
  expectedRent: number;
  serviceCharge: number;
  expected: number;
  received: number;
  variance: number;
  leaseEnd: Date | null;
  leaseStatus: string;
}

interface RentStatusTableProps {
  rows: RentRow[];
  currency?: string;
}

function statusBadge(status: string) {
  if (status === "CRITICAL") return <Badge variant="red">Expired</Badge>;
  if (status === "TBC")      return <Badge variant="gray">TBC</Badge>;
  if (status === "WARNING")  return <Badge variant="amber">Expiring</Badge>;
  return <Badge variant="green">Active</Badge>;
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

export function RentStatusTable({ rows, currency = "USD" }: RentStatusTableProps) {
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const totalVariance = totalReceived - totalExpected;

  return (
    <>
      {/* ── Mobile: stacked cards (no horizontal scroll) ─────────────────── */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-gray-100 bg-white p-3">
            {/* Tenant name + lease badge */}
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <div>
                <p className="font-sans font-medium text-sm text-header leading-tight">{row.tenantName}</p>
                <p className="text-xs text-gray-400 font-sans mt-0.5">
                  Unit {row.unitNumber} · {unitTypeLabel(row.type)}
                </p>
              </div>
              {statusBadge(row.leaseStatus)}
            </div>
            {/* Financials grid */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-50">
              <div>
                <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Expected</p>
                <CurrencyDisplay currency={currency} amount={row.expected} size="sm" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Received</p>
                <CurrencyDisplay currency={currency} amount={row.received} size="sm" colorize />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Variance</p>
                <span className={clsx(
                  "font-mono text-xs font-medium",
                  row.variance < 0 ? "text-expense" : row.variance > 0 ? "text-income" : "text-gray-400",
                )}>
                  {row.variance >= 0 ? "+" : ""}
                  <CurrencyDisplay currency={currency} amount={Math.abs(row.variance)} size="sm" />
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Totals card */}
        <div className="rounded-xl border border-gold/25 bg-cream p-3">
          <p className="text-xs font-medium text-header font-sans mb-2">Totals</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Expected</p>
              <CurrencyDisplay currency={currency} amount={totalExpected} size="sm" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Received</p>
              <CurrencyDisplay currency={currency} amount={totalReceived} size="sm" colorize />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-0.5">Variance</p>
              <CurrencyDisplay currency={currency} amount={totalVariance} size="sm" colorize />
            </div>
          </div>
        </div>
      </div>

      {/* ── Desktop: scrollable table with sticky header ──────────────────── */}
      <div className="hidden md:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
          <table className="w-full min-w-[600px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-left">
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">Tenant</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">Unit</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">Type</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans text-right">Expected</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans text-right">Received</th>
                <th className="pb-2 pr-3 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans text-right">Variance</th>
                <th className="pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">Lease</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="py-3 pr-3 text-sm font-sans text-header font-medium">{row.tenantName}</td>
                  <td className="py-3 pr-3 text-sm font-mono text-gray-500">{row.unitNumber}</td>
                  <td className="py-3 pr-3 text-sm font-sans text-gray-500">{unitTypeLabel(row.type)}</td>
                  <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={row.expected} size="sm" /></td>
                  <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={row.received} size="sm" colorize /></td>
                  <td className={clsx("py-3 pr-3 text-right font-mono text-sm", row.variance < 0 ? "text-expense" : row.variance > 0 ? "text-income" : "text-gray-400")}>
                    {row.variance >= 0 ? "+" : ""}<CurrencyDisplay currency={currency} amount={row.variance} size="sm" colorize />
                  </td>
                  <td className="py-3">{statusBadge(row.leaseStatus)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-gold/30">
                <td colSpan={3} className="pt-3 text-sm font-medium font-sans text-header">Total</td>
                <td className="pt-3 text-right"><CurrencyDisplay currency={currency} amount={totalExpected} size="sm" /></td>
                <td className="pt-3 text-right"><CurrencyDisplay currency={currency} amount={totalReceived} size="sm" colorize /></td>
                <td className={clsx("pt-3 text-right font-mono text-sm", totalVariance < 0 ? "text-expense" : "text-income")}>
                  <CurrencyDisplay currency={currency} amount={totalVariance} size="sm" colorize />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
