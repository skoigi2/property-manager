"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { HelpTip } from "./HelpTip";

export interface PaymentAccountOption {
  id: string;
  name: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  mpesaPaybill: string | null;
  mpesaTill: string | null;
}

let accountCache: PaymentAccountOption[] | null = null;
export function invalidatePaymentAccountCache() { accountCache = null; }

/**
 * Dropdown over the organisation's payment accounts with inline quick-create.
 * `value` is the account id or null (= inherit / none — the caller decides
 * what that means via `inheritLabel`).
 */
export function PaymentAccountSelect({
  value,
  onChange,
  label = "Payment account",
  inheritLabel = "— Use property default —",
  tooltip,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  inheritLabel?: string;
  tooltip?: string;
}) {
  const [accounts, setAccounts] = useState<PaymentAccountOption[]>(accountCache ?? []);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ name: "", bankName: "", bankAccountName: "", bankAccountNumber: "", mpesaPaybill: "", mpesaTill: "" });

  useEffect(() => {
    if (accountCache) { setAccounts(accountCache); return; }
    setLoading(true);
    fetch("/api/payment-accounts")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) { accountCache = d; setAccounts(d); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!draft.name.trim()) { toast.error("Give the account a name"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/payment-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          bankName: draft.bankName.trim() || null,
          bankAccountName: draft.bankAccountName.trim() || null,
          bankAccountNumber: draft.bankAccountNumber.trim() || null,
          mpesaPaybill: draft.mpesaPaybill.trim() || null,
          mpesaTill: draft.mpesaTill.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      invalidatePaymentAccountCache();
      setAccounts((prev) => {
        const next = [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
        accountCache = next;
        return next;
      });
      onChange(created.id);
      setCreating(false);
      setDraft({ name: "", bankName: "", bankAccountName: "", bankAccountNumber: "", mpesaPaybill: "", mpesaTill: "" });
      toast.success("Payment account created");
    } catch {
      toast.error("Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  const selected = accounts.find((a) => a.id === value);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-body font-medium text-gray-600 flex items-center gap-1.5">
          <span>{label}</span>
          {tooltip && <HelpTip text={tooltip} />}
        </label>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 text-caption font-medium text-gold hover:text-gold-dark transition-colors"
        >
          <Plus size={12} /> New account
        </button>
      </div>

      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full border border-gray-200 rounded-lg text-body px-3 py-2.5 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
      >
        <option value="">{inheritLabel}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.bankAccountNumber ? ` · ${a.bankName ?? "Bank"} ${a.bankAccountNumber}` : a.mpesaPaybill ? ` · Paybill ${a.mpesaPaybill}` : a.mpesaTill ? ` · Till ${a.mpesaTill}` : ""}
          </option>
        ))}
      </select>
      {loading && <p className="text-caption text-gray-400 mt-1">Loading accounts…</p>}
      {selected && (
        <p className="text-caption text-gray-400 mt-1">
          {[
            selected.bankName && `${selected.bankName}${selected.bankAccountNumber ? ` · ${selected.bankAccountNumber}` : ""}`,
            selected.mpesaPaybill && `Paybill ${selected.mpesaPaybill}`,
            selected.mpesaTill && `Till ${selected.mpesaTill}`,
          ].filter(Boolean).join("  ·  ") || "No bank or M-Pesa details captured yet"}
        </p>
      )}

      {creating && (
        <div className="mt-2 p-3 border border-gold/30 bg-gold/5 rounded-xl space-y-2">
          <input
            type="text" placeholder="Account name, e.g. KCB — Main Collections *"
            value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Bank name" value={draft.bankName} onChange={(e) => setDraft((d) => ({ ...d, bankName: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40" />
            <input type="text" placeholder="Account name" value={draft.bankAccountName} onChange={(e) => setDraft((d) => ({ ...d, bankAccountName: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40" />
            <input type="text" placeholder="Account number" value={draft.bankAccountNumber} onChange={(e) => setDraft((d) => ({ ...d, bankAccountNumber: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40" />
            <input type="text" placeholder="M-Pesa Paybill" value={draft.mpesaPaybill} onChange={(e) => setDraft((d) => ({ ...d, mpesaPaybill: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40" />
            <input type="text" placeholder="M-Pesa Till" value={draft.mpesaTill} onChange={(e) => setDraft((d) => ({ ...d, mpesaTill: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleCreate} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-white text-caption font-medium rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50">
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : "Create account"}
            </button>
            <button type="button" onClick={() => setCreating(false)}
              className="px-3 py-1.5 border border-gray-200 text-gray-500 text-caption rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
          <p className="text-caption text-gray-400 ">
            Full details (branch, instructions) can be edited later in Settings → Payment Accounts.
          </p>
        </div>
      )}
    </div>
  );
}
