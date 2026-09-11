"use client";

import { formatCurrency } from "@/lib/currency";

// Compact "what's on this invoice" chips for list rows: only shown when the
// invoice carries more than the plain rent lines (deposit / admin / lease
// fee), so a normal rent invoice stays uncluttered.

export interface InvoiceLinesForChips {
  rentAmount: number;
  serviceCharge?: number | null;
  otherCharges?: number | null;
  depositAmount?: number | null;
  adminFee?: number | null;
  leaseFee?: number | null;
}

export function invoiceLineChips(inv: InvoiceLinesForChips, currency: string): { label: string; amount: string; tone: "rent" | "movein" }[] {
  const hasMoveIn = (inv.depositAmount ?? 0) > 0 || (inv.adminFee ?? 0) > 0 || (inv.leaseFee ?? 0) > 0;
  if (!hasMoveIn) return [];
  const out: { label: string; amount: string; tone: "rent" | "movein" }[] = [];
  if (inv.rentAmount > 0) out.push({ label: "Rent", amount: formatCurrency(inv.rentAmount, currency), tone: "rent" });
  if ((inv.serviceCharge ?? 0) > 0) out.push({ label: "Svc", amount: formatCurrency(inv.serviceCharge!, currency), tone: "rent" });
  if ((inv.otherCharges ?? 0) > 0) out.push({ label: "Other", amount: formatCurrency(inv.otherCharges!, currency), tone: "rent" });
  if ((inv.depositAmount ?? 0) > 0) out.push({ label: "Deposit", amount: formatCurrency(inv.depositAmount!, currency), tone: "movein" });
  if ((inv.adminFee ?? 0) > 0) out.push({ label: "Admin fee", amount: formatCurrency(inv.adminFee!, currency), tone: "movein" });
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
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-caption ${c.tone === "movein" ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-600"}`}
        >
          <span className="font-medium">{c.label}</span>
          <span className="tabular-nums">{c.amount}</span>
        </span>
      ))}
    </div>
  );
}
