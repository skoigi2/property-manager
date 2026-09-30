"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HelpTip } from "@/components/ui/HelpTip";
import { formatCurrency } from "@/lib/currency";
import { readApiError } from "@/lib/api-error";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/expense-categories";
import { BASIS_LABEL, type ServiceChargeBasisValue } from "@/lib/service-charge";
import type { ServiceChargeView } from "@/lib/service-charge-data";

type Line = { category: string; amount: string; notes: string };

const COMMON_COSTS = ["SECURITY", "CLEANER", "GARBAGE_COLLECTION", "LANDSCAPING", "ELEVATOR", "MAINTENANCE", "WIFI", "PEST_CONTROL", "INSURANCE", "STAFF_WAGES"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (c: string) => (EXPENSE_CATEGORY_LABELS as Record<string, string>)[c] ?? c;
const input = "w-full border border-gray-200 rounded-lg px-3 py-2 text-body bg-white focus:outline-none focus:ring-2 focus:ring-gold/40";

/**
 * The year's budget: the costs the block shares (by expense category), how
 * they are split between units, and each unit's resulting monthly charge —
 * with "Apply to tenants" to bill that figure from the next invoices.
 */
export function BudgetTab({ view, onChanged, onDeleted }: { view: ServiceChargeView; onChanged: () => void; onDeleted: () => void }) {
  const fmt = (n: number) => formatCurrency(n, view.property.currency);
  const [lines, setLines] = useState<Line[]>([]);
  const [basis, setBasis] = useState<ServiceChargeBasisValue>(view.budget.basis);
  const [startMonth, setStartMonth] = useState(view.budget.startMonth);
  const [saving, setSaving] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setLines(view.budget.lines.map((l) => ({ category: l.category, amount: String(l.amount), notes: l.notes ?? "" })));
    setBasis(view.budget.basis);
    setStartMonth(view.budget.startMonth);
  }, [view.budget]);

  const total = lines.reduce((s, l) => s + (Number(l.amount.replace(/,/g, "")) || 0), 0);
  const dirty =
    basis !== view.budget.basis ||
    startMonth !== view.budget.startMonth ||
    JSON.stringify(lines.map((l) => [l.category, Number(l.amount.replace(/,/g, "")) || 0, l.notes.trim()])) !==
      JSON.stringify(view.budget.lines.map((l) => [l.category, l.amount, l.notes ?? ""]));
  const used = new Set(lines.map((l) => l.category));
  // New lines start on the usual shared costs of a block, in this order.
  const firstFree =
    COMMON_COSTS.find((c) => !used.has(c)) ?? EXPENSE_CATEGORIES.find((c) => !used.has(c)) ?? "OTHER";

  async function save() {
    if (new Set(lines.map((l) => l.category)).size !== lines.length) {
      toast.error("Each cost category can appear once");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/service-charge/budgets/${view.budget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basis,
          startMonth,
          lines: lines.map((l) => ({ category: l.category, amount: Number(l.amount.replace(/,/g, "")) || 0, notes: l.notes.trim() || null })),
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not save the budget"));
      toast.success("Budget saved");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the budget");
    } finally {
      setSaving(false);
    }
  }

  async function apply() {
    setApplying(true);
    try {
      const res = await fetch(`/api/service-charge/budgets/${view.budget.id}/apply-charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not update the tenants"));
      const d = await res.json();
      toast.success(d.updated ? `Monthly service charge updated for ${d.updated} tenant${d.updated === 1 ? "" : "s"}` : "Every tenant already pays the suggested charge");
      setApplyOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the tenants");
    } finally {
      setApplying(false);
    }
  }

  async function remove() {
    const res = await fetch(`/api/service-charge/budgets/${view.budget.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await readApiError(res, "Could not delete the budget"));
      return;
    }
    toast.success("Budget deleted");
    setDeleteOpen(false);
    onDeleted();
  }

  const changes = view.units.filter((u) => u.tenant && Math.abs(u.tenant.currentCharge - u.suggestedMonthly) > 0.005).length;

  return (
    <div className="space-y-4">
      {view.warnings.length > 0 && (
        <Card padding="sm" className="border border-amber-200 bg-amber-50/60">
          <ul className="text-body text-amber-900 space-y-1">
            {view.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div className="min-w-[12rem]">
            <label className="flex items-center gap-1.5 text-caption text-gray-500 mb-1">
              <span>Split between units by</span>
              <HelpTip text="Floor area uses each unit's size (Properties → units). Equal gives every unit the same share. Current service charge follows what each tenant pays today." />
            </label>
            <select value={basis} onChange={(e) => setBasis(e.target.value as ServiceChargeBasisValue)} className={input}>
              {(Object.keys(BASIS_LABEL) as ServiceChargeBasisValue[]).map((b) => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
            </select>
          </div>
          <div className="min-w-[10rem]">
            <label className="block text-caption text-gray-500 mb-1">Year starts in</label>
            <select value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} className={input}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <p className="text-caption text-gray-500 flex-1 min-w-[14rem]">
            Actual costs are the expenses recorded against the <strong>property</strong> (not a single unit) in these categories, including VAT.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="text-left text-caption text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium">Cost</th>
                <th className="py-2 pr-3 font-medium text-right w-44">Budget for the year</th>
                <th className="py-2 pr-3 font-medium">Note</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2 pr-3">
                    <select
                      value={l.category}
                      aria-label="Cost category"
                      onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}
                      className={input}
                    >
                      {EXPENSE_CATEGORIES.filter((c) => c === l.category || !used.has(c)).map((c) => <option key={c} value={c}>{label(c)}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min="0"
                      value={l.amount}
                      aria-label={`Budget for ${label(l.category)}`}
                      onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                      className={`${input} text-right tabular-nums`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      maxLength={200}
                      value={l.notes}
                      placeholder="e.g. 2 guards, 24 h"
                      onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
                      className={input}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50" aria-label="Remove cost">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-gray-400">No costs yet — add the block&apos;s shared costs: security, cleaning, garbage, gardens, lift, generator…</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-3">
                  <button
                    onClick={() => setLines((ls) => [...ls, { category: firstFree, amount: "", notes: "" }])}
                    className="inline-flex items-center gap-1 text-body font-medium text-gold-dark hover:underline"
                  >
                    <Plus size={14} /> Add cost
                  </button>
                </td>
                <td className="py-3 pr-3 text-right font-semibold tabular-nums">{fmt(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button onClick={save} loading={saving} disabled={!dirty}>Save budget</Button>
          {dirty && <span className="text-caption text-amber-700">Unsaved changes — the unit shares below update after saving.</span>}
          <button onClick={() => setDeleteOpen(true)} className="ml-auto text-caption text-gray-400 hover:text-expense">Delete this budget</button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-h3 text-header">Each unit&apos;s share</h3>
            <p className="text-caption text-gray-500 mt-0.5">
              Split by {BASIS_LABEL[view.budget.basisUsed].toLowerCase()}. The suggested monthly charge recovers the unit&apos;s share of the budget over 12 months.
            </p>
          </div>
          <Button variant="secondary" size="sm" disabled={changes === 0 || view.budget.total <= 0} onClick={() => setApplyOpen(true)}>
            Apply to tenants{changes > 0 ? ` (${changes})` : ""}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="text-left text-caption text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium">Unit</th>
                <th className="py-2 pr-3 font-medium text-right">Size (sqm)</th>
                <th className="py-2 pr-3 font-medium text-right">Share</th>
                <th className="py-2 pr-3 font-medium text-right">Share of budget</th>
                <th className="py-2 pr-3 font-medium text-right">Suggested monthly</th>
                <th className="py-2 pr-3 font-medium">Tenant</th>
                <th className="py-2 font-medium text-right">Pays now</th>
              </tr>
            </thead>
            <tbody>
              {view.units.map((u) => {
                const off = u.tenant && Math.abs(u.tenant.currentCharge - u.suggestedMonthly) > 0.005;
                return (
                  <tr key={u.unitId} className="border-b border-gray-50">
                    <td className="py-2 pr-3 font-medium">{u.unitNumber}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{u.sizeSqm ?? <span className="text-amber-600">—</span>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{(u.share * 100).toFixed(2)}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(u.budgetShare)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">{fmt(u.suggestedMonthly)}</td>
                    <td className="py-2 pr-3 text-gray-600">{u.tenant?.name ?? <span className="text-gray-400">Vacant</span>}</td>
                    <td className={`py-2 text-right tabular-nums ${off ? "text-amber-700" : "text-gray-600"}`}>{u.tenant ? fmt(u.tenant.currentCharge) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onConfirm={apply}
        loading={applying}
        title="Apply the suggested service charge?"
        message={`${changes} tenant${changes === 1 ? "'s" : "s'"} monthly service charge will change to the suggested figure. Invoices already raised stay as they are; the next ones bill the new amount. Consider telling the tenants first.`}
        confirmLabel="Apply"
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        title={`Delete the ${view.period.label} budget?`}
        message="The budget and its costs are removed. Expenses and invoices are not touched."
        confirmLabel="Delete"
      />
    </div>
  );
}
