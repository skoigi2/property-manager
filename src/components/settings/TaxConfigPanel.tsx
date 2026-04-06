"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Plus, Pencil, ToggleLeft, ToggleRight, Info } from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxConfig {
  id: string;
  orgId: string;
  propertyId: string | null;
  label: string;
  rate: number;
  type: "ADDITIVE" | "WITHHELD";
  appliesTo: string[];
  isInclusive: boolean;
  isActive: boolean;
  effectiveFrom: string;
}

// ─── appliesTo options ────────────────────────────────────────────────────────

const APPLIES_TO_OPTIONS = [
  { value: "LONGTERM_RENT",       label: "Long-term rent",         side: "income"  },
  { value: "AIRBNB",              label: "Short-let / Airbnb",     side: "income"  },
  { value: "SERVICE_CHARGE",      label: "Service charge",         side: "income"  },
  { value: "MANAGEMENT_FEE_INCOME", label: "Management fee",       side: "income"  },
  { value: "LETTING_FEE_INCOME",  label: "Letting fee",            side: "income"  },
  { value: "CONTRACTOR_LABOUR",   label: "Contractor labour",      side: "expense" },
  { value: "CONTRACTOR_MATERIALS",label: "Contractor materials",   side: "expense" },
  { value: "VENDOR_INVOICE",      label: "Any vendor invoice",     side: "expense" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TaxConfigForm({
  initial,
  orgId,
  propertyId,
  onSave,
  onClose,
}: {
  initial?: TaxConfig | null;
  orgId: string;
  propertyId: string | null;
  onSave: (config: TaxConfig) => void;
  onClose: () => void;
}) {
  const [label,         setLabel]         = useState(initial?.label ?? "");
  const [ratePercent,   setRatePercent]   = useState(initial ? String(Math.round(initial.rate * 100)) : "");
  const [type,          setType]          = useState<"ADDITIVE" | "WITHHELD">(initial?.type ?? "ADDITIVE");
  const [appliesTo,     setAppliesTo]     = useState<string[]>(initial?.appliesTo ?? []);
  const [isInclusive,   setIsInclusive]   = useState(initial?.isInclusive ?? false);
  const [effectiveFrom, setEffectiveFrom] = useState(
    initial?.effectiveFrom ? initial.effectiveFrom.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);

  function toggleAppliesTo(val: string) {
    setAppliesTo((prev) =>
      prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { toast.error("Label is required"); return; }
    const rate = parseFloat(ratePercent) / 100;
    if (isNaN(rate) || rate <= 0 || rate > 1) { toast.error("Rate must be between 0.01% and 100%"); return; }
    if (appliesTo.length === 0) { toast.error("Select at least one transaction type"); return; }

    setSaving(true);
    try {
      const url    = initial ? `/api/tax-configs/${initial.id}` : "/api/tax-configs";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          propertyId: propertyId ?? null,
          label: label.trim(),
          rate,
          type,
          appliesTo,
          isInclusive,
          effectiveFrom,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      const saved: TaxConfig = await res.json();
      toast.success(initial ? "Tax config updated" : "Tax config created");
      onSave(saved);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const incomeOptions  = APPLIES_TO_OPTIONS.filter((o) => o.side === "income");
  const expenseOptions = APPLIES_TO_OPTIONS.filter((o) => o.side === "expense");

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Label"
          placeholder="e.g. VAT, WHT, GST"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <Input
          label="Rate (%)"
          type="number"
          placeholder="e.g. 16"
          min="0.01"
          max="100"
          step="0.01"
          value={ratePercent}
          onChange={(e) => setRatePercent(e.target.value)}
          required
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-2">
          Tax Mechanism
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(["ADDITIVE", "WITHHELD"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-2.5 rounded-xl border text-sm font-sans text-left transition-colors ${
                type === t
                  ? "border-gold bg-gold/5 text-header font-medium"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <p className="font-medium">{t === "ADDITIVE" ? "Additive" : "Withheld"}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                {t === "ADDITIVE"
                  ? "Added on top — VAT, GST. Increases invoice total."
                  : "Deducted from gross — WHT, TDS. Reduces remittance."}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Applies To */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-2">
          Applies To
        </label>
        <div className="space-y-2">
          <p className="text-xs text-gray-400 font-sans">Income transactions</p>
          <div className="flex flex-wrap gap-2">
            {incomeOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleAppliesTo(o.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-sans border transition-colors ${
                  appliesTo.includes(o.value)
                    ? "border-gold bg-gold/10 text-gold-dark font-medium"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 font-sans mt-2">Expense line items</p>
          <div className="flex flex-wrap gap-2">
            {expenseOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleAppliesTo(o.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-sans border transition-colors ${
                  appliesTo.includes(o.value)
                    ? "border-gold bg-gold/10 text-gold-dark font-medium"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Options row */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isInclusive}
            onChange={(e) => setIsInclusive(e.target.checked)}
            className="rounded border-gray-300 text-gold focus:ring-gold"
          />
          <span className="text-sm font-sans text-gray-600">Tax-inclusive (extract from stated amount)</span>
        </label>
      </div>

      <Input
        label="Effective From"
        type="date"
        value={effectiveFrom}
        onChange={(e) => setEffectiveFrom(e.target.value)}
      />

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Saving…" : initial ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function TaxConfigPanel({
  orgId,
  propertyId,
  currency,
}: {
  orgId: string;
  propertyId: string | null;   // null = org-level
  currency?: string;
}) {
  const [configs,   setConfigs]   = useState<TaxConfig[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState<TaxConfig | null>(null);
  const [toggling,  setToggling]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ orgId });
      if (propertyId) params.set("propertyId", propertyId);
      const res = await fetch(`/api/tax-configs?${params}`);
      if (res.ok) setConfigs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [orgId, propertyId]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(config: TaxConfig) {
    setToggling(config.id);
    try {
      const res = await fetch(`/api/tax-configs/${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !config.isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated: TaxConfig = await res.json();
      setConfigs((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      toast.success(updated.isActive ? "Tax config activated" : "Tax config deactivated");
    } catch {
      toast.error("Failed to update");
    } finally {
      setToggling(null);
    }
  }

  function handleSaved(saved: TaxConfig) {
    setConfigs((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next;
      }
      return [...prev, saved];
    });
    setShowModal(false);
    setEditing(null);
  }

  const incomeConfigs  = configs.filter((c) => c.appliesTo.some((a) => ["LONGTERM_RENT","AIRBNB","SERVICE_CHARGE","MANAGEMENT_FEE_INCOME","LETTING_FEE_INCOME"].includes(a)));
  const expenseConfigs = configs.filter((c) => c.appliesTo.some((a) => ["CONTRACTOR_LABOUR","CONTRACTOR_MATERIALS","VENDOR_INVOICE"].includes(a)));

  const appliesToLabel = (vals: string[]) =>
    vals.map((v) => APPLIES_TO_OPTIONS.find((o) => o.value === v)?.label ?? v).join(", ");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-sans">
            {propertyId
              ? "Tax rules for this property. These override org-level defaults."
              : "Organisation-level defaults, applied to all properties unless overridden."}
          </p>
          {configs.length === 0 && !loading && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-400 font-sans">
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>No tax configs — system behaves as tax-free. A US user would leave this empty.</span>
            </div>
          )}
        </div>
        <Button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 text-sm"
        >
          <Plus size={14} /> Add Tax Rule
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : configs.length === 0 ? null : (
        <div className="space-y-3">
          {[
            { label: "Income (output tax)", list: incomeConfigs },
            { label: "Expenses (input tax)", list: expenseConfigs },
          ].map(({ label, list }) =>
            list.length === 0 ? null : (
              <div key={label}>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-sans mb-1.5">{label}</p>
                <div className="space-y-2">
                  {list.map((config) => (
                    <div
                      key={config.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                        config.isActive ? "border-gray-100 bg-white" : "border-dashed border-gray-200 bg-gray-50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-header">
                              {config.label} ({(config.rate * 100).toFixed(0)}%)
                            </span>
                            <Badge variant={config.type === "ADDITIVE" ? "blue" : "amber"}>
                              {config.type === "ADDITIVE" ? "Additive" : "Withheld"}
                            </Badge>
                            {!config.isActive && <Badge variant="gray">Inactive</Badge>}
                            {config.isInclusive && <Badge variant="gray">Inclusive</Badge>}
                          </div>
                          <p className="text-xs text-gray-400 font-sans mt-0.5 truncate">
                            {appliesToLabel(config.appliesTo)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditing(config); setShowModal(true); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => toggleActive(config)}
                          disabled={toggling === config.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          title={config.isActive ? "Deactivate" : "Activate"}
                        >
                          {config.isActive
                            ? <ToggleRight size={16} className="text-gold" />
                            : <ToggleLeft size={16} />
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {showModal && (
        <Modal
          open={showModal}
          title={editing ? "Edit Tax Rule" : "Add Tax Rule"}
          onClose={() => { setShowModal(false); setEditing(null); }}
        >
          <TaxConfigForm
            initial={editing}
            orgId={orgId}
            propertyId={propertyId}
            onSave={handleSaved}
            onClose={() => { setShowModal(false); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
}
