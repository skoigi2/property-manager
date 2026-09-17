"use client";

import { formatCurrency } from "@/lib/currency";

// Compact "what's on this invoice" chips for list rows: only shown when the
// invoice carries more than the plain rent lines (metered water /
// electricity, deposit, lease fee), so a normal rent invoice stays uncluttered.

export interface InvoiceLinesForChips {
  rentAmount: number;
  serviceCharge?: number | null;
  otherCharges?: number | null;
  waterAmount?: number | null;
  electricityAmount?: number | null;
  depositAmount?: number | null;
  leaseFee?: number | null;
}

type ChipTone = "rent" | "utility" | "movein";

export function invoiceLineChips(inv: InvoiceLinesForChips, currency: string): { label: string; amount: string; tone: ChipTone }[] {
  const hasMoveIn = (inv.depositAmount ?? 0) > 0 || (inv.leaseFee ?? 0) > 0;
  const hasUtilities = (inv.waterAmount ?? 0) > 0 || (inv.electricityAmount ?? 0) > 0;
  if (!hasMoveIn && !hasUtilities) return [];
  const out: { label: string; amount: string; tone: ChipTone }[] = [];
  if (inv.rentAmount > 0) out.push({ label: "Rent", amount: formatCurrency(inv.rentAmount, currency), tone: "rent" });
  if ((inv.serviceCharge ?? 0) > 0) out.push({ label: "Svc", amount: formatCurrency(inv.serviceCharge!, currency), tone: "rent" });
  if ((inv.otherCharges ?? 0) > 0) out.push({ label: "Other", amount: formatCurrency(inv.otherCharges!, currency), tone: "rent" });
  if ((inv.waterAmount ?? 0) > 0) out.push({ label: "Water", amount: formatCurrency(inv.waterAmount!, currency), tone: "utility" });
  if ((inv.electricityAmount ?? 0) > 0) out.push({ label: "Power", amount: formatCurrency(inv.electricityAmount!, currency), tone: "utility" });
  if ((inv.depositAmount ?? 0) > 0) out.push({ label: "Deposit", amount: formatCurrency(inv.depositAmount!, currency), tone: "movein" });
  if ((inv.leaseFee ?? 0) > 0) out.push({ label: "Lease fee", amount: formatCurrency(inv.leaseFee!, currency), tone: "movein" });
  return out;
}

export function InvoiceLineChips({ invoice, currency, className = "" }: { invoice: InvoiceLinesForChips; currency: string; className?: string }) {
  const chips = invoiceLineChips(invoice, currency);
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {chips.map((c) => (
        <span
          key={c.label}
          title={`${c.label}: ${c.amount}`}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-caption ${c.tone === "movein" ? "bg-amber-50 text-amber-800" : c.tone === "utility" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}
        >
          <span className="font-medium">{c.label}</span>
          <span className="tabular-nums">{c.amount}</span>
        </span>
      ))}
    </div>
  );
}
