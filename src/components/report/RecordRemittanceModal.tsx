"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/currency";

export interface StatementPayout {
  id: string;
  amount: number;
  paidAt: string;
  method: string | null;
  reference: string | null;
}

const PAYOUT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "MPESA",         label: "M-Pesa" },
  { value: "CHEQUE",        label: "Cheque" },
  { value: "CASH",          label: "Cash" },
  { value: "OTHER",         label: "Other" },
];

/**
 * Records an OwnerPayout against a statement period. Shared by the manager
 * Owner Statement tab (report page) and the owner-facing dashboard card.
 */
export function RecordRemittanceModal({
  propertyId, propertyName, period, currency, netPayable, totalPaidOut,
  year, month, onClose, onRecorded,
}: {
  propertyId: string;
  propertyName: string;
  period: string;
  currency: string;
  netPayable: number;
  totalPaidOut: number;
  year: string | number;
  month: string | number;
  onClose: () => void;
  onRecorded: (p: StatementPayout) => void;
}) {
  const outstanding = Math.max(0, netPayable - totalPaidOut);
  const [amount, setAmount]       = useState(String(outstanding > 0 ? outstanding.toFixed(2) : ""));
  const [paidAt, setPaidAt]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod]       = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes]         = useState("");
  const [saving, setSaving]       = useState(false);

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!paidAt) { toast.error("Enter the payment date"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          periodYear:  Number(year),
          periodMonth: Number(month),
          amount:      amt,
          paidAt,
          method,
          reference:   reference || null,
          notes:       notes || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to record remittance");
      }
      const p = await res.json();
      onRecorded({
        id: p.id,
        amount: Number(p.amount),
        paidAt: format(new Date(p.paidAt), "d MMM yyyy"),
        method: p.method,
        reference: p.reference,
      });
      toast.success("Remittance recorded");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record remittance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-h3 text-header">Record remittance</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-cream"><X size={16} /></button>
        </div>
        <p className="text-caption text-gray-500 mb-4">
          {propertyName} — {period}. Net payable {formatCurrency(netPayable, currency)}
          {totalPaidOut > 0 && <> · already remitted {formatCurrency(totalPaidOut, currency)}</>}
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-label uppercase text-gray-500 block mb-1">Amount paid to owner</label>
            <input
              type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body tabular-nums focus:outline-none focus:border-gold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label uppercase text-gray-500 block mb-1">Date paid</label>
              <input
                type="date" value={paidAt} max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="text-label uppercase text-gray-500 block mb-1">Method</label>
              <select
                value={method} onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:border-gold bg-white"
              >
                {PAYOUT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-label uppercase text-gray-500 block mb-1">Reference <span className="normal-case">(optional)</span></label>
            <input
              type="text" value={reference} placeholder="Transfer / transaction reference"
              onChange={(e) => setReference(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="text-label uppercase text-gray-500 block mb-1">Notes <span className="normal-case">(optional)</span></label>
            <textarea
              value={notes} rows={2}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:border-gold resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-body text-gray-500 hover:bg-cream">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-2 rounded-lg text-body font-medium bg-gold text-header hover:bg-gold/90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Record payment
          </button>
        </div>
      </div>
    </div>
  );
}
