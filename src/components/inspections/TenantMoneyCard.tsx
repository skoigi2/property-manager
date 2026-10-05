"use client";
import { formatCurrency } from "@/lib/currency";
import type { InspectionDto } from "./types";

/**
 * Rent, Wi-Fi, deposit and what the tenant still owes. Shown on inspections
 * to managers, and to caretakers when the organisation allows it.
 */
export function TenantMoneyCard({ money }: { money: NonNullable<InspectionDto["tenantMoney"]> }) {
  const fmt = (n: number) => formatCurrency(n, money.currency);
  const o = money.outstanding;
  const owing = [
    o.rent > 0 ? `rent ${fmt(o.rent)}` : null,
    o.water > 0 ? `water ${fmt(o.water)}` : null,
    o.electricity > 0 ? `electricity ${fmt(o.electricity)}` : null,
    o.wifi > 0 ? `Wi-Fi ${fmt(o.wifi)}` : null,
    o.deposit > 0 ? `deposit ${fmt(o.deposit)}` : null,
    o.leaseFee > 0 ? `lease fee ${fmt(o.leaseFee)}` : null,
  ].filter(Boolean);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-cream/40 p-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-caption">
        <Figure label="Rent" value={fmt(money.monthlyRent)} />
        {money.serviceCharge > 0 && <Figure label="Service charge" value={fmt(money.serviceCharge)} />}
        {money.wifiCharge > 0 && <Figure label="Wi-Fi" value={fmt(money.wifiCharge)} />}
        <Figure
          label="Deposit"
          value={fmt(money.depositReceived ?? money.depositContractual)}
          note={money.depositReceived === null ? "Not recorded as paid" : undefined}
        />
      </div>
      {o.total > 0 ? (
        <p className="text-caption text-expense">
          <span className="font-medium">Owes {fmt(o.total)}</span>
          {money.overdueInvoices > 0 ? ` · ${money.overdueInvoices} overdue invoice${money.overdueInvoices === 1 ? "" : "s"}` : ""}
          {owing.length > 1 ? ` — ${owing.join(", ")}` : ""}
        </p>
      ) : (
        <p className="text-caption text-green-700">Nothing owed on open invoices.</p>
      )}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-label uppercase text-gray-400">{label}</p>
      <p className="text-body text-header tabular-nums truncate">{value}</p>
      {note && <p className="text-caption text-amber-700">{note}</p>}
    </div>
  );
}
