"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/currency";
import toast from "react-hot-toast";

const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "MPESA",         label: "M-Pesa" },
  { value: "CASH",          label: "Cash" },
  { value: "CARD",          label: "Card" },
  { value: "CHEQUE",        label: "Cheque" },
  { value: "OTHER",         label: "Other" },
];

interface OpenItem {
  id: string;
  date: string;
  dueDate: string | null;
  categoryLabel: string;
  description: string | null;
  propertyName: string | null;
  total: number;
  paid: number;
  outstanding: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  vendor: { id: string; name: string } | null;
  onSaved?: () => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function RecordPaymentModal({ open, onClose, vendor, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [openItems, setOpenItems] = useState<OpenItem[]>([]);
  const [currency, setCurrency]   = useState<string>("KES");

  const [paymentDate, setPaymentDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount]               = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [reference, setReference]         = useState("");
  const [notes, setNotes]                 = useState("");
  const [allocs, setAllocs]               = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !vendor) return;
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount(""); setReference(""); setNotes(""); setAllocs({});
    setPaymentMethod("BANK_TRANSFER");
    setLoading(true);
    fetch(`/api/vendors/${vendor.id}/statement`)
      .then((r) => r.json())
      .then((data) => {
        setOpenItems(data.openItems ?? []);
        if (data.currency) setCurrency(data.currency);
      })
      .catch(() => toast.error("Failed to load outstanding expenses"))
      .finally(() => setLoading(false));
  }, [open, vendor]);

  const amountNum = parseFloat(amount) || 0;
  const allocatedTotal = useMemo(
    () => round2(Object.values(allocs).reduce((s, v) => s + (parseFloat(v) || 0), 0)),
    [allocs]
  );
  const remainder = round2(amountNum - allocatedTotal);
  const overAllocated = remainder < -0.005;

  function setAlloc(id: string, value: string) {
    setAllocs((prev) => ({ ...prev, [id]: value }));
  }

  function fillAlloc(item: OpenItem) {
    // Fill with whatever is smaller: the item's balance or the unused payment.
    const current = parseFloat(allocs[item.id] || "0") || 0;
    const available = round2(remainder + current);
    const fill = Math.min(item.outstanding, Math.max(available, 0));
    setAlloc(item.id, fill > 0 ? String(fill) : "");
  }

  async function handleSave() {
    if (!vendor) return;
    if (!(amountNum > 0)) { toast.error("Enter a payment amount"); return; }
    if (overAllocated)    { toast.error("Allocated total exceeds the payment amount"); return; }

    const allocations = Object.entries(allocs)
      .map(([expenseEntryId, v]) => ({ expenseEntryId, amount: parseFloat(v) || 0 }))
      .filter((a) => a.amount > 0);

    setSaving(true);
    try {
      const res = await fetch("/api/vendor-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: vendor.id,
          paymentDate,
          amount: amountNum,
          paymentMethod,
          reference: reference || null,
          notes: notes || null,
          allocations,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "Failed to record payment");
        return;
      }
      toast.success("Payment recorded");
      onSaved?.();
      onClose();
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Record payment — ${vendor?.name ?? ""}`} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Payment date *"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
          <Input
            label="Amount *"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <Select
            label="Payment method *"
            options={PAYMENT_METHODS}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          />
          <Input
            label="Reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque / M-Pesa no."
            tooltip="The cheque number or M-Pesa transaction code for this remittance"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-caption font-medium text-gray-500">
              Allocate to outstanding expenses
            </span>
            <span className={`text-caption font-medium ${overAllocated ? "text-expense" : "text-gray-500"}`}>
              Unallocated: {formatCurrency(remainder, currency)}
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : openItems.length === 0 ? (
            <div className="text-caption text-gray-400 bg-gray-50 rounded-lg p-3">
              No outstanding expenses for this vendor. The full amount will sit as
              unallocated credit on the vendor account.
            </div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-caption">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Expense</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium">Outstanding</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium w-40">Allocate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {openItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <div className="text-gray-700">{item.description || item.categoryLabel}</div>
                        <div className="text-gray-400">
                          {new Date(item.date).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
                          {item.propertyName ? ` · ${item.propertyName}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-expense font-medium whitespace-nowrap">
                        {formatCurrency(item.outstanding, currency)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={allocs[item.id] ?? ""}
                            onChange={(e) => setAlloc(item.id, e.target.value)}
                            className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-caption text-right focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
                            placeholder="0"
                          />
                          <button
                            type="button"
                            onClick={() => fillAlloc(item)}
                            className="text-caption text-gold hover:text-gold-dark font-medium"
                            title="Fill from remaining payment"
                          >
                            Fill
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {overAllocated && (
            <p className="text-caption text-expense mt-1.5">
              Allocations exceed the payment amount — reduce an allocation or increase the amount.
            </p>
          )}
        </div>

        <div>
          <label className="block text-caption font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional notes…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none bg-cream"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button onClick={handleSave} loading={saving} disabled={overAllocated || !(amountNum > 0)}>
            Record payment
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
