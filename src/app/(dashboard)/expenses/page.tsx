"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { expenseEntrySchema, type ExpenseEntryInput } from "@/lib/validations";
import { formatDate } from "@/lib/date-utils";
import {
  Trash2, Plus, Receipt, Wallet, Pencil, ChevronDown, ChevronRight,
  CheckCircle2, Clock, AlertCircle, FileDown,
} from "lucide-react";
import { exportExpenses } from "@/lib/excel-export";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY",
  "CLEANER","CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER",
];
const CAT_LABELS: Record<string, string> = {
  SERVICE_CHARGE: "Service Charge", MANAGEMENT_FEE: "Management Fee",
  WIFI: "Wi-Fi", WATER: "Water", ELECTRICITY: "Electricity",
  CLEANER: "Cleaner", CONSUMABLES: "Consumables", MAINTENANCE: "Maintenance",
  REINSTATEMENT: "Reinstatement", CAPITAL: "Capital Item", OTHER: "Other",
};
const LINE_CATEGORIES = ["LABOUR", "MATERIAL", "QUOTE"] as const;
type LineCat = typeof LINE_CATEGORIES[number];
type PayStatus = "UNPAID" | "PARTIAL" | "PAID";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItemDraft {
  id?: string;
  category: LineCat;
  description: string;
  amount: string;
  isVatable: boolean;
  paymentStatus: PayStatus;
  amountPaid: string;
  paymentReference: string;
}

function blankLine(): LineItemDraft {
  return { category: "LABOUR", description: "", amount: "", isVatable: false, paymentStatus: "UNPAID", amountPaid: "", paymentReference: "" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aggregatePayment(lineItems: any[]): PayStatus | null {
  if (!lineItems?.length) return null;
  const statuses = lineItems.map((i: any) => i.paymentStatus as PayStatus);
  if (statuses.every((s) => s === "PAID")) return "PAID";
  if (statuses.every((s) => s === "UNPAID")) return "UNPAID";
  return "PARTIAL";
}

function PayBadge({ status }: { status: PayStatus | null }) {
  if (!status) return null;
  const cfg = {
    PAID:    { variant: "green" as const, icon: <CheckCircle2 size={11} />, label: "Paid" },
    PARTIAL: { variant: "amber" as const, icon: <AlertCircle size={11} />,   label: "Partial" },
    UNPAID:  { variant: "gray"  as const, icon: <Clock size={11} />,         label: "Unpaid" },
  }[status];
  return (
    <Badge variant={cfg.variant}>
      <span className="flex items-center gap-1">{cfg.icon}{cfg.label}</span>
    </Badge>
  );
}

// ─── Line Items Editor ────────────────────────────────────────────────────────

function LineItemsEditor({ items, onChange }: { items: LineItemDraft[]; onChange: (items: LineItemDraft[]) => void }) {
  function update(idx: number, patch: Partial<LineItemDraft>) {
    const next = items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onChange(next);
  }
  function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)); }
  function add() { onChange([...items, blankLine()]); }

  const totalVatable = items.filter((i) => i.isVatable).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-sans font-semibold text-header">Line Items</h4>
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs text-gold hover:text-gold-dark font-sans font-medium transition-colors">
          <Plus size={13} /> Add line
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400 font-sans italic">No line items — the amount above will be used as a single total.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2.5 bg-cream/30">
              {/* Row 1: category + description + amount + VAT */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-400 font-sans mb-1">Type</label>
                  <select
                    value={item.category}
                    onChange={(e) => update(idx, { category: e.target.value as LineCat })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-sans bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  >
                    {LINE_CATEGORIES.map((c) => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}
                  </select>
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-gray-400 font-sans mb-1">Description</label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    placeholder="e.g. Paint & materials"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-sans bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-400 font-sans mb-1">Amount (KSh)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.amount}
                    onChange={(e) => update(idx, { amount: e.target.value })}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-sans bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div className="col-span-1 flex flex-col items-center gap-1">
                  <label className="block text-xs text-gray-400 font-sans">VAT</label>
                  <input
                    type="checkbox"
                    checked={item.isVatable}
                    onChange={(e) => update(idx, { isVatable: e.target.checked })}
                    className="w-4 h-4 rounded accent-gold mt-1"
                  />
                </div>
                <div className="col-span-1 flex justify-end pb-1">
                  <button type="button" onClick={() => remove(idx)} className="text-gray-300 hover:text-expense transition-colors p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Row 2: payment status */}
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-400 font-sans mb-1">Payment</label>
                  <select
                    value={item.paymentStatus}
                    onChange={(e) => update(idx, { paymentStatus: e.target.value as PayStatus, amountPaid: e.target.value === "PAID" ? item.amount : item.amountPaid })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-sans bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  >
                    <option value="UNPAID">Unpaid</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="PAID">Paid</option>
                  </select>
                </div>
                {(item.paymentStatus === "PARTIAL" || item.paymentStatus === "PAID") && (
                  <div>
                    <label className="block text-xs text-gray-400 font-sans mb-1">Amount Paid (KSh)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.amountPaid}
                      onChange={(e) => update(idx, { amountPaid: e.target.value })}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-sans bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                  </div>
                )}
                {(item.paymentStatus === "PARTIAL" || item.paymentStatus === "PAID") && (
                  <div>
                    <label className="block text-xs text-gray-400 font-sans mb-1">Payment Reference</label>
                    <input
                      type="text"
                      value={item.paymentReference}
                      onChange={(e) => update(idx, { paymentReference: e.target.value })}
                      placeholder="e.g. M-PESA ref, bank transfer"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-sans bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Totals row */}
          <div className="flex items-center justify-between px-1 text-xs font-sans">
            <span className="text-gray-400">
              {totalVatable > 0 && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                  VATable: KSh {totalVatable.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                </span>
              )}
            </span>
            <span className="font-semibold text-header">
              Total: KSh {items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { data: session } = useSession();
  const [properties, setProperties] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [showForm, setShowForm] = useState(false);
  const [pettyCashBalance, setPettyCashBalance] = useState<number | null>(null);
  const [editEntry, setEditEntry] = useState<any | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<ExpenseEntryInput>({
    resolver: zodResolver(expenseEntrySchema),
    defaultValues: { scope: "UNIT", isSunkCost: false, paidFromPettyCash: false, amount: 0 },
  });

  const scope = watch("scope");
  const paidFromPettyCash = watch("paidFromPettyCash");
  const allUnits = properties.flatMap((p: any) =>
    (p.units ?? []).map((u: any) => ({ ...u, propertyName: p.name }))
  );

  // Auto-compute amount from line items
  useEffect(() => {
    if (lineItems.length > 0) {
      const total = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
      setValue("amount", total);
    }
  }, [lineItems, setValue]);

  // Fetch petty cash balance when form is shown
  useEffect(() => {
    if (!showForm) return;
    fetch("/api/petty-cash")
      .then((r) => r.json())
      .then((entries: any[]) => {
        const balance = entries.length > 0 ? entries[0].balance : 0;
        setPettyCashBalance(balance);
      })
      .catch(() => setPettyCashBalance(null));
  }, [showForm]);

  useEffect(() => { fetch("/api/properties").then((r) => r.json()).then(setProperties); }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/expenses?year=${month.getFullYear()}&month=${month.getMonth() + 1}`)
      .then((r) => r.json())
      .then((d) => { setEntries(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month]);

  const resetForm = useCallback(() => {
    reset({ scope: "UNIT", isSunkCost: false, paidFromPettyCash: false, amount: 0 });
    setEditEntry(null);
    setSelectedUnitIds([]);
    setLineItems([]);
    setShowForm(false);
  }, [reset]);

  function openEdit(e: any) {
    setEditEntry(e);
    // Pre-populate form
    const dateStr = new Date(e.date).toISOString().split("T")[0];
    reset({
      date: dateStr,
      scope: e.scope,
      unitId: e.unitId ?? undefined,
      propertyId: e.propertyId ?? undefined,
      category: e.category,
      amount: e.amount,
      description: e.description ?? "",
      isSunkCost: e.isSunkCost,
      paidFromPettyCash: e.paidFromPettyCash,
    });
    // Unit IDs
    if (e.unitAllocations?.length > 0) {
      setSelectedUnitIds(e.unitAllocations.map((a: any) => a.unitId));
    } else if (e.unitId) {
      setSelectedUnitIds([e.unitId]);
    } else {
      setSelectedUnitIds([]);
    }
    // Line items
    setLineItems(
      (e.lineItems ?? []).map((item: any) => ({
        id: item.id,
        category: item.category as LineCat,
        description: item.description ?? "",
        amount: String(item.amount),
        isVatable: item.isVatable,
        paymentStatus: item.paymentStatus as PayStatus,
        amountPaid: String(item.amountPaid),
        paymentReference: item.paymentReference ?? "",
      }))
    );
    setShowForm(true);
  }

  function toggleUnit(unitId: string) {
    setSelectedUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function onSubmit(data: ExpenseEntryInput) {
    setSubmitting(true);
    try {
      // Build final unit resolution
      const unitIds = scope === "UNIT" ? selectedUnitIds : [];
      const unitId = unitIds.length === 1 ? unitIds[0] : undefined;

      const payload = {
        ...data,
        unitId,
        unitIds,
        lineItems: lineItems.map((item) => ({
          id: item.id,
          category: item.category,
          description: item.description || undefined,
          amount: parseFloat(item.amount) || 0,
          isVatable: item.isVatable,
          paymentStatus: item.paymentStatus,
          amountPaid: parseFloat(item.amountPaid) || 0,
          paymentReference: item.paymentReference || undefined,
        })),
      };

      const url = editEntry ? `/api/expenses/${editEntry.id}` : "/api/expenses";
      const method = editEntry ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();

      if (editEntry) {
        setEntries((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
        toast.success("Expense updated");
      } else {
        setEntries((prev) => [saved, ...prev]);
        toast.success(data.paidFromPettyCash ? "Expense saved & petty cash debited" : "Expense added");
      }
      resetForm();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/expenses/${deleteId}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== deleteId));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  const totalOp = entries.filter((e: any) => !e.isSunkCost).reduce((s: number, e: any) => s + e.amount, 0);
  const totalSunk = entries.filter((e: any) => e.isSunkCost).reduce((s: number, e: any) => s + e.amount, 0);
  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // Label for multi-unit column
  function unitLabel(e: any): string {
    if (e.unitAllocations?.length > 1) {
      return `${e.unitAllocations.length} units (split)`;
    }
    return e.unit?.unitNumber ?? e.property?.name ?? e.scope;
  }

  const hasLineItems = lineItems.length > 0;
  const computedTotal = hasLineItems
    ? lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
    : null;

  return (
    <div>
      <Header title="Expenses" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">

        {/* Month selector */}
        <div className="flex items-center gap-3">
          <MonthPicker value={month} onChange={setMonth} max={new Date()} />
          {!isCurrentMonth && (
            <button
              onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="text-xs text-gold hover:text-gold-dark font-sans font-medium underline underline-offset-2 transition-colors"
            >
              Back to current month
            </button>
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Operating Expenses", value: -totalOp, color: "text-expense" },
            { label: "Capital / Sunk Costs", value: -totalSunk, color: "text-gray-500" },
            { label: "Total", value: -(totalOp + totalSunk), color: "text-expense" },
          ].map((s) => (
            <Card key={s.label} padding="sm">
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">{s.label}</p>
              <CurrencyDisplay amount={s.value} className={`block mt-1 ${s.color}`} size="lg" />
            </Card>
          ))}
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="section-header">Entries</h2>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                onClick={() => exportExpenses(entries, month)}
                title="Export to Excel"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
              >
                <FileDown size={13} /> Export
              </button>
            )}
            <Button onClick={() => { if (showForm && !editEntry) { resetForm(); } else { resetForm(); setShowForm(true); } }} size="sm" variant="gold">
              <Plus size={15} /> Add Expense
            </Button>
          </div>
        </div>

        {/* Add / Edit Form */}
        {showForm && (
          <Card>
            <h3 className="font-display text-base text-header mb-4">
              {editEntry ? "Edit Expense" : "New Expense"}
            </h3>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Date + Scope */}
              <div className="grid grid-cols-2 gap-4">
                <Input label="Date" type="date" {...register("date")} error={errors.date?.message} />
                <Select label="Scope" {...register("scope")} options={[
                  { value: "UNIT", label: "Unit" },
                  { value: "PROPERTY", label: "Whole Property" },
                  { value: "PORTFOLIO", label: "Whole Portfolio" },
                ]} />
              </div>

              {/* Unit multi-select */}
              {scope === "UNIT" && (
                <div>
                  <label className="block text-sm font-sans font-medium text-gray-700 mb-1.5">
                    Units <span className="text-gray-400 font-normal">(select one or more — cost split equally)</span>
                  </label>
                  <div className="border border-gray-200 rounded-xl p-3 max-h-44 overflow-y-auto space-y-1.5 bg-white">
                    {allUnits.length === 0 && (
                      <p className="text-xs text-gray-400 font-sans">No units available</p>
                    )}
                    {allUnits.map((u: any) => (
                      <label key={u.id} className="flex items-center gap-2.5 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          checked={selectedUnitIds.includes(u.id)}
                          onChange={() => toggleUnit(u.id)}
                          className="w-4 h-4 rounded accent-gold flex-shrink-0"
                        />
                        <span className="text-sm font-sans text-gray-700 group-hover:text-header transition-colors">
                          <span className="font-mono">{u.unitNumber}</span>
                          <span className="text-gray-400 ml-1">({u.propertyName})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedUnitIds.length > 1 && (
                    <p className="text-xs text-gold font-sans mt-1.5 font-medium">
                      {selectedUnitIds.length} units selected — total split equally (each gets {Math.round(100 / selectedUnitIds.length)}%)
                    </p>
                  )}
                </div>
              )}

              {/* Property dropdown */}
              {scope === "PROPERTY" && (
                <Select
                  label="Property"
                  placeholder="Select property..."
                  {...register("propertyId")}
                  options={properties.map((p: any) => ({ value: p.id, label: p.name }))}
                />
              )}

              {/* Category */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Category"
                  {...register("category")}
                  options={CATEGORIES.map((c) => ({ value: c, label: CAT_LABELS[c] }))}
                  error={errors.category?.message}
                />
                {/* Amount — readonly when line items exist */}
                {hasLineItems ? (
                  <div>
                    <label className="block text-sm font-sans font-medium text-gray-700 mb-1.5">
                      Total Amount <span className="text-gray-400 font-normal">(computed)</span>
                    </label>
                    <div className="border border-gray-200 rounded-xl px-3 py-2 bg-cream font-mono text-sm text-header">
                      KSh {(computedTotal ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </div>
                    <input type="hidden" {...register("amount")} />
                  </div>
                ) : (
                  <Input label="Amount (KSh)" type="number" step="0.01" min="0" prefix="KSh" {...register("amount")} error={errors.amount?.message} />
                )}
              </div>

              <Input label="Description" {...register("description")} placeholder="Optional description..." />

              {/* Sunk cost */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" {...register("isSunkCost")} className="w-4 h-4 rounded border-gray-300 accent-gold" />
                <span className="text-sm font-sans text-gray-600">
                  Sunk cost / capital item <span className="text-gray-400">(excluded from monthly P&L)</span>
                </span>
              </label>

              {/* Paid from petty cash */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" {...register("paidFromPettyCash")} className="w-4 h-4 rounded border-gray-300 accent-gold" />
                  <div className="flex items-center gap-2">
                    <Wallet size={14} className="text-amber-600" />
                    <span className="text-sm font-sans text-gray-700 font-medium">Paid from petty cash</span>
                  </div>
                </label>
                {paidFromPettyCash && (
                  <div className="pl-7 text-xs font-sans">
                    {pettyCashBalance === null ? (
                      <span className="text-gray-400">Loading balance…</span>
                    ) : (
                      <span className={pettyCashBalance >= 0 ? "text-income" : "text-expense"}>
                        Current petty cash balance: KSh {pettyCashBalance.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        {pettyCashBalance < 0 && " ⚠ Deficit — consider topping up"}
                      </span>
                    )}
                    <p className="text-gray-400 mt-0.5">A matching Petty Cash OUT entry will be created automatically.</p>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 pt-4">
                <LineItemsEditor items={lineItems} onChange={setLineItems} />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={submitting}>{editEntry ? "Update Expense" : "Save Expense"}</Button>
                <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Table */}
        <Card padding="none">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : entries.length === 0 ? (
            <EmptyState
              title="No expenses"
              description="No expenses logged for this month"
              icon={<Receipt size={40} />}
              action={<Button variant="gold" size="sm" onClick={() => { resetForm(); setShowForm(true); }}><Plus size={14} /> Add Expense</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead className="bg-cream-dark">
                  <tr>
                    {["", "Date", "Unit/Scope", "Category", "Amount", "Payment", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e: any) => {
                    const payStatus = aggregatePayment(e.lineItems);
                    const isExpanded = expandedRows.has(e.id);
                    const hasItems = e.lineItems?.length > 0;

                    return (
                      <>
                        <tr key={e.id} className="border-t border-gray-50 hover:bg-cream/50 transition-colors">
                          {/* Expand toggle */}
                          <td className="px-2 py-3 w-6">
                            {hasItems ? (
                              <button onClick={() => toggleRow(e.id)} className="text-gray-300 hover:text-gold transition-colors p-1">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            ) : <span className="w-6 inline-block" />}
                          </td>
                          <td className="px-4 py-3 text-sm font-sans text-gray-600">{formatDate(e.date)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-500">{unitLabel(e)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={e.isSunkCost ? "gray" : "blue"}>{CAT_LABELS[e.category]}</Badge>
                              {e.paidFromPettyCash && (
                                <span title="Paid from petty cash"><Wallet size={12} className="text-amber-500" /></span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <CurrencyDisplay amount={e.amount} size="sm" className={e.isSunkCost ? "text-gray-400 line-through" : "text-expense"} />
                            {e.unitAllocations?.length > 1 && (
                              <p className="text-xs text-gray-400 font-sans mt-0.5">
                                KSh {(e.amount / e.unitAllocations.length).toLocaleString("en-KE", { maximumFractionDigits: 0 })} / unit
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <PayBadge status={payStatus} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(e)} className="text-gray-300 hover:text-gold transition-colors p-1" title="Edit">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-expense transition-colors p-1" title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded line items */}
                        {isExpanded && hasItems && (
                          <tr key={`${e.id}-expanded`} className="border-t border-gray-50 bg-cream/40">
                            <td colSpan={7} className="px-6 pb-4 pt-2">
                              <table className="w-full text-xs font-sans">
                                <thead>
                                  <tr className="text-gray-400 uppercase tracking-wide">
                                    <th className="text-left py-1 pr-4">Type</th>
                                    <th className="text-left py-1 pr-4">Description</th>
                                    <th className="text-right py-1 pr-4">Amount</th>
                                    <th className="text-center py-1 pr-4">VAT</th>
                                    <th className="text-left py-1 pr-4">Payment</th>
                                    <th className="text-right py-1 pr-4">Paid</th>
                                    <th className="text-left py-1">Reference</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {e.lineItems.map((item: any) => (
                                    <tr key={item.id} className="border-t border-gray-100">
                                      <td className="py-1.5 pr-4 font-medium text-gray-700">
                                        {item.category[0] + item.category.slice(1).toLowerCase()}
                                      </td>
                                      <td className="py-1.5 pr-4 text-gray-500">{item.description || "—"}</td>
                                      <td className="py-1.5 pr-4 text-right font-mono text-gray-700">
                                        KSh {item.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-1.5 pr-4 text-center">
                                        {item.isVatable ? (
                                          <span className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-medium">VAT</span>
                                        ) : "—"}
                                      </td>
                                      <td className="py-1.5 pr-4">
                                        <PayBadge status={item.paymentStatus as PayStatus} />
                                      </td>
                                      <td className="py-1.5 pr-4 text-right font-mono text-gray-600">
                                        {item.amountPaid > 0
                                          ? `KSh ${item.amountPaid.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`
                                          : "—"}
                                      </td>
                                      <td className="py-1.5 text-gray-500 max-w-[140px] truncate">
                                        {item.paymentReference || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {/* VATable summary */}
                              {e.lineItems.some((i: any) => i.isVatable) && (
                                <p className="text-xs text-amber-700 font-sans mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 inline-block">
                                  VATable total: KSh {e.lineItems.filter((i: any) => i.isVatable).reduce((s: number, i: any) => s + i.amount, 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete expense?"
        message="This expense entry will be permanently deleted. Note: any petty cash OUT entry created with it will NOT be automatically reversed."
        loading={deleting}
      />
    </div>
  );
}
