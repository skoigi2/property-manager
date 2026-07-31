"use client";
import { useEffect, useState } from "react";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { formatCurrency } from "@/lib/currency";
import { Banknote, CheckCircle2, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";

// Actionable task list for unverified deposits: each row mints the tenant's
// DEPOSIT income receipt (the trail behind src/lib/deposit.ts) on confirm.
// The amount is prefilled with the contractual figure but the DATE is
// deliberately blank and mandatory — every confirmation requires at least
// one real recollection, so verifying can't become pure muscle memory.
// There is intentionally NO "confirm all" bulk action.

export interface UnverifiedDepositTenant {
  id: string;
  name: string;
  unitId: string;
  unitNumber: string;
  propertyName: string;
  currency: string;
  contractual: number;
  leaseStart: string | null;
}

export function DepositVerifyDrawer({
  open,
  tenants,
  onVerified,
  onClose,
}: {
  open: boolean;
  tenants: UnverifiedDepositTenant[];
  /** Called after a receipt is recorded so the parent can update its list. */
  onVerified: (tenantId: string, amount: number) => void;
  onClose: () => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  // Snapshot the task list when the drawer opens: confirmed rows stay visible
  // with a "Receipt recorded" check instead of vanishing as the parent's
  // unverified list shrinks.
  const [list, setList] = useState<UnverifiedDepositTenant[]>([]);
  useEffect(() => {
    if (open) {
      setList(tenants);
      setDone(new Set());
      setAmounts({});
      setDates({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const pending = list.filter((t) => !done.has(t.id));

  async function confirmReceipt(t: UnverifiedDepositTenant) {
    const amount = parseFloat(amounts[t.id] ?? String(t.contractual)) || 0;
    const date = dates[t.id];
    if (!date) {
      toast.error("Enter the date the deposit was received");
      return;
    }
    if (amount <= 0) {
      toast.error("Amount received must be greater than zero");
      return;
    }
    setSaving(t.id);
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          unitId: t.unitId,
          tenantId: t.id,
          type: "DEPOSIT",
          grossAmount: amount,
          agentCommission: 0,
          note: "Deposit receipt (verified from Tenants page)",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Failed to record receipt");
      }
      setDone((p) => new Set(p).add(t.id));
      onVerified(t.id, amount);
      toast.success(`Deposit verified for ${t.name}`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to record receipt");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg text-header flex items-center gap-2">
              <Banknote size={18} className="text-gold" /> Verify deposits
            </h2>
            <p className="text-xs text-gray-400 font-sans mt-1">
              Confirm what was <span className="font-medium text-gray-500">actually received</span> for
              each tenant — this records the deposit receipt that settlements refund from. Adjust the
              amount for partial deposits; the date is required.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {list.length === 0 && (
            <p className="text-sm text-gray-400 font-sans text-center py-10">
              No unverified deposits — all receipts are on record. 🎉
            </p>
          )}
          {list.map((t) => {
            const isDone = done.has(t.id);
            const isSaving = saving === t.id;
            const dateVal = dates[t.id] ?? "";
            return (
              <div key={t.id} className={`px-5 py-4 ${isDone ? "bg-green-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium font-sans text-gray-700 truncate">{t.name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">
                      {t.unitNumber} · {t.propertyName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wide">Contractual</p>
                    <CurrencyDisplay currency={t.currency} amount={t.contractual} size="sm" className="text-header font-medium" />
                  </div>
                </div>

                {isDone ? (
                  <p className="flex items-center gap-1.5 text-xs text-green-700 font-sans mt-3">
                    <CheckCircle2 size={14} /> Receipt recorded
                  </p>
                ) : (
                  <div className="flex items-end gap-2 mt-3">
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-1">
                        Amount received
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={amounts[t.id] ?? String(t.contractual)}
                        onChange={(e) => setAmounts((p) => ({ ...p, [t.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-400 font-sans uppercase tracking-wide mb-1">
                        Date received <span className="text-amber-600">*</span>
                      </label>
                      <input
                        type="date"
                        value={dateVal}
                        onChange={(e) => setDates((p) => ({ ...p, [t.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                      />
                    </div>
                    <button
                      disabled={isSaving || !dateVal}
                      onClick={() => confirmReceipt(t)}
                      title={!dateVal ? "Enter the date the deposit was received" : undefined}
                      className="flex items-center gap-1 text-xs font-medium font-sans text-white bg-gold hover:bg-gold-dark px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                    >
                      {isSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Confirm
                    </button>
                  </div>
                )}
                {!isDone && (amounts[t.id] !== undefined) && (parseFloat(amounts[t.id]) || 0) < t.contractual && (parseFloat(amounts[t.id]) || 0) > 0 && (
                  <p className="text-[11px] text-amber-600 font-sans mt-1.5">
                    Partial: {formatCurrency(parseFloat(amounts[t.id]) || 0, t.currency)} of{" "}
                    {formatCurrency(t.contractual, t.currency)} — the shortfall will show on the tenant&apos;s Deposit tab.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400 font-sans">
            {pending.length} remaining
          </p>
          <button
            onClick={onClose}
            className="text-xs font-medium font-sans text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
