"use client";
import { useEffect, useState } from "react";
import { X, Receipt, Loader2, Link2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date-utils";
import toast from "react-hot-toast";

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  periodYear: number;
  periodMonth: number;
  totalAmount: number;
  paidAmount: number | null;
  status: string;
  dueDate: string;
}

interface Props {
  entry: { id: string; tenantId: string; tenantName: string; grossAmount: number; date: string };
  currency: string;
  onLinked: () => void;
  onClose: () => void;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Allocate an existing payment (IncomeEntry) to one of the tenant's invoices.
 * Fills the gap where a payment was recorded manually without picking an
 * invoice — the PATCH mirrors the auto-link behaviour of POST /api/income,
 * including flipping a fully-covered invoice to PAID.
 */
export function LinkInvoiceModal({ entry, currency, onLinked, onClose }: Props) {
  const [invoices, setInvoices] = useState<InvoiceOption[] | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invoices?tenantId=${entry.tenantId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: InvoiceOption[] = (Array.isArray(d) ? d : [])
          .filter((i: InvoiceOption) => i.status !== "CANCELLED")
          .sort((a: InvoiceOption, b: InvoiceOption) =>
            b.periodYear - a.periodYear || b.periodMonth - a.periodMonth);
        setInvoices(list);
      })
      .catch(() => { if (!cancelled) setInvoices([]); });
    return () => { cancelled = true; };
  }, [entry.tenantId]);

  async function link(inv: InvoiceOption) {
    setLinkingId(inv.id);
    try {
      const res = await fetch(`/api/income/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to allocate");
      toast.success(`Payment allocated to ${inv.invoiceNumber}`);
      onLinked();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-gold-dark" />
            <h3 className="text-h3 text-gray-900">Allocate payment to invoice</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-body text-gray-700">
            {formatCurrency(entry.grossAmount, currency)} received {formatDate(entry.date)} from{" "}
            <span className="font-medium">{entry.tenantName}</span>
          </div>

          {invoices === null ? (
            <div className="flex items-center gap-2 text-gray-400 text-body py-4">
              <Loader2 size={14} className="animate-spin" /> Loading invoices…
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-body text-gray-500 py-2">
              This tenant has no invoices to allocate against. Generate invoices first
              (Invoices page, or enable auto-invoicing under Automations).
            </p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {invoices.map((inv) => {
                const outstanding = inv.totalAmount - (inv.paidAmount ?? 0);
                const isPaid = inv.status === "PAID";
                const covers = Math.abs(entry.grossAmount - outstanding) < 0.01;
                return (
                  <button
                    key={inv.id}
                    onClick={() => link(inv)}
                    disabled={linkingId !== null}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-50/60 transition-colors disabled:opacity-50 ${isPaid ? "opacity-60" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="text-body text-gray-900 flex items-center gap-1.5">
                        <Receipt size={12} className="text-gray-400 shrink-0" />
                        {MONTH_NAMES[inv.periodMonth - 1]} {inv.periodYear}
                        <span className="text-caption text-gray-400">{inv.invoiceNumber}</span>
                      </p>
                      <p className="text-caption text-gray-400 mt-0.5">
                        {isPaid
                          ? "Already paid — link for record only"
                          : `Outstanding ${formatCurrency(outstanding, currency)} · due ${formatDate(inv.dueDate)}`}
                        {covers && !isPaid ? " · exact match" : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {linkingId === inv.id ? (
                        <Loader2 size={14} className="animate-spin text-gold-dark" />
                      ) : (
                        <span className="text-caption font-medium text-gold-dark">
                          {isPaid ? "Link" : covers ? "Settle" : "Allocate"}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-caption text-gray-400">
            Allocating a payment that covers the full invoice marks it as paid, the same as
            recording the payment against it directly.
          </p>
        </div>
      </div>
    </div>
  );
}
