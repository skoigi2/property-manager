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
  if (status === "TBC") return <Badge variant="gray">TBC</Badge>;
  if (status === "WARNING") return <Badge variant="amber">Expiring</Badge>;
  return <Badge variant="green">Active</Badge>;
}

export function RentStatusTable({ rows, currency = "USD" }: RentStatusTableProps) {
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[600px]">
        <thead>
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
              <td className="py-3 pr-3 text-sm font-sans text-gray-500">{row.type === "ONE_BED" ? "1 Bed" : "2 Bed"}</td>
              <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={row.expected} size="sm" /></td>
              <td className="py-3 pr-3 text-right"><CurrencyDisplay currency={currency} amount={row.received} size="sm" colorize /></td>
              <td className={clsx("py-3 pr-3 text-right font-mono text-sm", row.variance < 0 ? "text-expense" : row.variance > 0 ? "text-income" : "text-gray-400")}>
                {row.variance >= 0 ? "+" : ""}<CurrencyDisplay currency={currency} amount={row.variance} size="sm" colorize />
              </td>
              <td className="py-3">{statusBadge(row.leaseStatus)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gold/30">
            <td colSpan={3} className="pt-3 text-sm font-medium font-sans text-header">Total</td>
            <td className="pt-3 text-right"><CurrencyDisplay currency={currency} amount={totalExpected} size="sm" /></td>
            <td className="pt-3 text-right"><CurrencyDisplay currency={currency} amount={totalReceived} size="sm" colorize /></td>
            <td className={clsx("pt-3 text-right font-mono text-sm", totalReceived - totalExpected < 0 ? "text-expense" : "text-income")}>
              <CurrencyDisplay currency={currency} amount={totalReceived - totalExpected} size="sm" colorize />
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
