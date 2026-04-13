"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
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
import { HelpTip } from "@/components/ui/HelpTip";
import { expenseEntrySchema, type ExpenseEntryInput } from "@/lib/validations";
import { formatDate } from "@/lib/date-utils";
import {
  Trash2, Plus, Receipt, Wallet, Pencil, ChevronDown, ChevronRight, ChevronUp,
  CheckCircle2, Clock, AlertCircle, FileDown, Search, AlertTriangle, X,
  ChevronsUpDown, GripVertical, Paperclip,
} from "lucide-react";
import { ExpenseDocumentUpload } from "@/components/expenses/ExpenseDocumentUpload";
import { ExpenseDocumentList } from "@/components/expenses/ExpenseDocumentList";
import { VendorSelect } from "@/components/ui/VendorSelect";
import { exportExpenses } from "@/lib/excel-export";
import { formatCurrency, formatNumber } from "@/lib/currency";
import { clsx } from "clsx";
import { useProperty } from "@/lib/property-context";

// ─── Tax helpers (client-side, mirrors tax-engine pure functions) ─────────────

interface TaxConfigMeta {
  id: string;
  label: string;
  rate: number;
  type: "ADDITIVE" | "WITHHELD";
  appliesTo: string[];
  isInclusive: boolean;
  isActive?: boolean;
}

function lineItemCatToAppliesTo(cat: string): string {
  if (cat === "LABOUR")   return "CONTRACTOR_LABOUR";
  if (cat === "MATERIAL") return "CONTRACTOR_MATERIALS";
  return "VENDOR_INVOICE";
}

function matchTaxConfig(configs: TaxConfigMeta[], appliesTo: string): TaxConfigMeta | null {
  return configs.find((c) => c.appliesTo.includes(appliesTo)) ?? null;
}

function computeTaxAmount(amount: number, config: TaxConfigMeta): number {
  if (config.type === "ADDITIVE" && config.isInclusive) {
    return amount - amount / (1 + config.rate);
  }
  return amount * config.rate;
}

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

function LineItemsEditor({
  items,
  onChange,
  taxConfigs,
  currency,
}: {
  items: LineItemDraft[];
  onChange: (items: LineItemDraft[]) => void;
  taxConfigs: TaxConfigMeta[] | null;
  currency: string;
}) {
  function update(idx: number, patch: Partial<LineItemDraft>) {
    const next = items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onChange(next);
  }
  function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)); }
  function add() { onChange([...items, blankLine()]); }

  const totalVatable = items.filter((i) => i.isVatable).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  // Per-item tax computation
  const itemTax = items.map((item) => {
    if (!item.isVatable || !taxConfigs) return null;
    const amount = parseFloat(item.amount) || 0;
    if (amount === 0) return null;
    const config = matchTaxConfig(taxConfigs, lineItemCatToAppliesTo(item.category));
    if (!config) return null;
    return { config, taxAmount: computeTaxAmount(amount, config) };
  });

  // Aggregate tax summary
  let inputVatAdditive = 0;
  let whtWithheld = 0;
  itemTax.forEach((t) => {
    if (!t) return;
    if (t.config.type === "ADDITIVE") inputVatAdditive += t.taxAmount;
    else whtWithheld += t.taxAmount;
  });
  const hasTax = inputVatAdditive > 0 || whtWithheld > 0;

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
                  <label className="block text-xs text-gray-400 font-sans mb-1">Amount</label>
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
                  <label className="block text-xs text-gray-400 font-sans">Tax</label>
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

              {/* Tax badge */}
              {itemTax[idx] && (
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-sans border ${
                    itemTax[idx]!.config.type === "ADDITIVE"
                      ? "bg-blue-50 text-blue-700 border-blue-100"
                      : "bg-amber-50 text-amber-700 border-amber-100"
                  }`}>
                    {itemTax[idx]!.config.label} ({(itemTax[idx]!.config.rate * 100).toFixed(0)}%):{" "}
                    {formatCurrency(itemTax[idx]!.taxAmount, currency)}
                    {itemTax[idx]!.config.type === "WITHHELD" && " withheld"}
                  </span>
                </div>
              )}
              {item.isVatable && taxConfigs !== null && !itemTax[idx] && (
                <p className="text-xs text-gray-400 font-sans italic">No matching tax rule for this category.</p>
              )}

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
                    <label className="block text-xs text-gray-400 font-sans mb-1">Amount Paid</label>
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
                  Taxable: {formatNumber(totalVatable)}
                </span>
              )}
            </span>
            <span className="font-semibold text-header">
              Total: {formatNumber(items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}
            </span>
          </div>

          {/* Tax Summary box */}
          {hasTax && (
            <div className="border border-amber-100 rounded-xl bg-amber-50/60 px-4 py-3 space-y-1.5">
              <p className="text-xs font-sans font-semibold text-amber-800 uppercase tracking-wide">Tax Summary</p>
              {inputVatAdditive > 0 && (
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="text-gray-600">Input VAT / GST (reclaimable)</span>
                  <span className="font-medium text-blue-700">{formatCurrency(inputVatAdditive, currency)}</span>
                </div>
              )}
              {whtWithheld > 0 && (
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="text-gray-600">WHT / TDS to withhold</span>
                  <span className="font-medium text-amber-700">{formatCurrency(whtWithheld, currency)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { data: session } = useSession();
  const { selectedId, selected, properties } = useProperty();
  const currency = selected?.currency ?? "USD";
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
  const [docPanelRows, setDocPanelRows] = useState<Set<string>>(new Set());
  const [expenseDocs, setExpenseDocs]   = useState<Record<string, any[]>>({});
  const [docLoading, setDocLoading]     = useState<Set<string>>(new Set());
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [taxConfigs, setTaxConfigs] = useState<TaxConfigMeta[] | null>(null);

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterScope, setFilterScope] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterSunk, setFilterSunk] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Column order (draggable), persisted to localStorage
  const DEFAULT_COL_ORDER = ["date", "unit", "property", "category", "description", "amount", "payment"];
  const [colOrder, setColOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COL_ORDER;
    try {
      const saved = localStorage.getItem("expenses-col-order");
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return DEFAULT_COL_ORDER;
  });
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

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

  // Fetch tax configs when form opens.
  // orgId is optional — the API derives it from propertyId when absent (covers super-admin).
  useEffect(() => {
    if (!showForm) return;
    const params = new URLSearchParams();
    const orgId = session?.user?.organizationId ?? "";
    if (orgId)      params.set("orgId",      orgId);
    if (selectedId) params.set("propertyId", selectedId);
    if (!orgId && !selectedId) { setTaxConfigs([]); return; }
    fetch(`/api/tax-configs?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then((configs: TaxConfigMeta[]) => setTaxConfigs(configs.filter((c) => c.isActive !== false)))
      .catch(() => setTaxConfigs([]));
  }, [showForm, selectedId, session?.user?.organizationId]);

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

  useEffect(() => {
    setLoading(true);
    setSelectedIds(new Set());
    const params = new URLSearchParams({
      year: String(month.getFullYear()),
      month: String(month.getMonth() + 1),
    });
    if (selectedId) params.set("propertyId", selectedId);
    fetch(`/api/expenses?${params}`)
      .then((r) => r.json())
      .then((d) => { setEntries(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month, selectedId]);

  const resetForm = useCallback(() => {
    reset({ scope: "UNIT", isSunkCost: false, paidFromPettyCash: false, amount: 0 });
    setEditEntry(null);
    setSelectedUnitIds([]);
    setLineItems([]);
    setVendorId(null);
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
    setVendorId(e.vendorId ?? null);
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

  async function loadDocs(expenseId: string) {
    setDocLoading((prev) => { const next = new Set(prev); next.add(expenseId); return next; });
    try {
      const res = await fetch(`/api/expenses/${expenseId}/documents`);
      if (!res.ok) return;
      const docs = await res.json();
      setExpenseDocs((prev) => ({ ...prev, [expenseId]: docs }));
    } finally {
      setDocLoading((prev) => { const next = new Set(prev); next.delete(expenseId); return next; });
    }
  }

  function toggleDocPanel(id: string) {
    setDocPanelRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else { next.add(id); if (!expenseDocs[id]) loadDocs(id); }
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
        vendorId: vendorId || null,
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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === displayEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayEntries.map((e: any) => e.id)));
    }
  }

  async function bulkAction(action: "delete" | "retype" | "mark_sunk" | "mark_operating") {
    if (selectedIds.size === 0) return;
    setBulkSubmitting(true);
    try {
      const body: any = { action, ids: Array.from(selectedIds) };
      if (action === "retype") body.category = bulkCategory;
      const res = await fetch("/api/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      // Reload entries for the month
      setLoading(true);
      const reloadParams = new URLSearchParams({ year: String(month.getFullYear()), month: String(month.getMonth() + 1) });
      if (selectedId) reloadParams.set("propertyId", selectedId);
      const updated = await fetch(`/api/expenses?${reloadParams}`).then((r) => r.json());
      setEntries(updated);
      setLoading(false);
      toast.success(action === "delete" ? "Entries deleted" : "Entries updated");
    } catch { toast.error("Bulk action failed"); }
    finally { setBulkSubmitting(false); }
  }

  const totalOp = entries.filter((e: any) => !e.isSunkCost).reduce((s: number, e: any) => s + e.amount, 0);
  const totalSunk = entries.filter((e: any) => e.isSunkCost).reduce((s: number, e: any) => s + e.amount, 0);
  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // Label for unit/scope column
  function unitLabel(e: any): string {
    if (e.unitAllocations?.length > 1) {
      return `${e.unitAllocations.length} units (split)`;
    }
    return e.unit?.unitNumber ?? e.property?.name ?? e.scope;
  }

  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // Property name for new column
  function propertyLabel(e: any): string {
    if (e.scope === "PORTFOLIO") return "All Properties";
    if (e.property?.name) return e.property.name;
    if (e.unit?.property?.name) return e.unit.property.name;
    return "—";
  }

  // Filtered + sorted entries for table display (KPI cards always use full `entries`)
  const displayEntries = useMemo(() => {
    let result = entries
      .filter((e: any) => {
        if (!filterSearch) return true;
        const term = filterSearch.toLowerCase();
        const inDesc  = (e.description ?? "").toLowerCase().includes(term);
        const inItems = e.lineItems?.some((i: any) => (i.description ?? "").toLowerCase().includes(term));
        return inDesc || inItems;
      })
      .filter((e: any) => !filterCategory || e.category === filterCategory)
      .filter((e: any) => !filterScope || e.scope === filterScope)
      .filter((e: any) => !filterSunk || (filterSunk === "op" ? !e.isSunkCost : e.isSunkCost))
      .filter((e: any) => {
        if (!filterPayment) return true;
        const status = aggregatePayment(e.lineItems);
        if (status === null) return true; // no line items → always show
        return status === filterPayment;
      });

    if (sortCol) {
      result = [...result].sort((a: any, b: any) => {
        let cmp = 0;
        if (sortCol === "date") {
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
        } else if (sortCol === "amount") {
          cmp = a.amount - b.amount;
        } else if (sortCol === "property") {
          cmp = propertyLabel(a).localeCompare(propertyLabel(b));
        } else if (sortCol === "category") {
          cmp = (CAT_LABELS[a.category] ?? "").localeCompare(CAT_LABELS[b.category] ?? "");
        } else if (sortCol === "description") {
          cmp = (a.description ?? "").localeCompare(b.description ?? "");
        } else if (sortCol === "payment") {
          const order = { PAID: 0, PARTIAL: 1, UNPAID: 2 };
          const sa = aggregatePayment(a.lineItems);
          const sb = aggregatePayment(b.lineItems);
          cmp = (order[sa as keyof typeof order] ?? 3) - (order[sb as keyof typeof order] ?? 3);
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [entries, filterSearch, filterCategory, filterScope, filterSunk, filterPayment, sortCol, sortDir]);

  const hasFilters = !!(filterSearch || filterCategory || filterScope || filterPayment || filterSunk);

  // Outstanding payments
  const unpaidEntries = entries.filter((e: any) => {
    const s = aggregatePayment(e.lineItems);
    return s === "UNPAID" || s === "PARTIAL";
  });
  const unpaidTotal = unpaidEntries.reduce((s: number, e: any) => s + e.amount, 0);

  const hasLineItems = lineItems.length > 0;
  const computedTotal = hasLineItems
    ? lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
    : null;

  const SORTABLE_COLS = new Set(["date", "property", "category", "description", "amount", "payment"]);
  const COL_LABELS: Record<string, string> = {
    date: "Date", unit: "Unit/Scope", property: "Property",
    category: "Category", description: "Description", amount: "Amount", payment: "Payment",
  };

  function renderColHeader(key: string) {
    const sortable = SORTABLE_COLS.has(key);
    const isActive = sortCol === key;
    return (
      <th
        key={key}
        onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; setDragOverCol(key); }}
        onDrop={(ev) => {
          ev.preventDefault();
          const fromKey = ev.dataTransfer.getData("text/plain");
          if (!fromKey || fromKey === key) { setDragOverCol(null); return; }
          const next = [...colOrder];
          const from = next.indexOf(fromKey);
          const to = next.indexOf(key);
          if (from === -1 || to === -1) return;
          next.splice(from, 1);
          next.splice(to, 0, fromKey);
          setColOrder(next);
          localStorage.setItem("expenses-col-order", JSON.stringify(next));
          setDragOverCol(null);
        }}
        onDragLeave={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOverCol(null);
        }}
        className={clsx(
          "px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans select-none",
          dragOverCol === key && "border-l-2 border-gold bg-gold/5"
        )}
      >
        <span className="flex items-center gap-1">
          {/* Drag handle */}
          <span
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData("text/plain", key);
              ev.dataTransfer.effectAllowed = "move";
              // Use the parent <th> as the drag image for better UX
              const th = ev.currentTarget.closest("th");
              if (th) ev.dataTransfer.setDragImage(th, th.offsetWidth / 2, th.offsetHeight / 2);
              setDragCol(key);
            }}
            onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
            className="cursor-grab text-gray-300 hover:text-gray-500 flex-shrink-0 pr-0.5"
          >
            <GripVertical size={11} />
          </span>
          {/* Sort button */}
          {sortable ? (
            <button
              type="button"
              onClick={() => handleSort(key)}
              className="flex items-center gap-1 hover:text-header transition-colors cursor-pointer"
            >
              {COL_LABELS[key]}
              {isActive
                ? sortDir === "asc"
                  ? <ChevronUp size={12} className="text-gold flex-shrink-0" />
                  : <ChevronDown size={12} className="text-gold flex-shrink-0" />
                : <ChevronsUpDown size={12} className="text-gray-300 flex-shrink-0" />
              }
            </button>
          ) : (
            <span>{COL_LABELS[key]}</span>
          )}
        </span>
      </th>
    );
  }

  function renderColCell(key: string, e: any) {
    const payStatus = aggregatePayment(e.lineItems);
    const propName = propertyLabel(e);
    switch (key) {
      case "date":
        return <td key={key} className="px-4 py-3 text-sm font-sans text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>;
      case "unit":
        return <td key={key} className="px-4 py-3 text-sm font-mono text-gray-500">{unitLabel(e)}</td>;
      case "property":
        return <td key={key} className="px-4 py-3"><Badge variant={propName === "All Properties" ? "gray" : "blue"}>{propName}</Badge></td>;
      case "category":
        return (
          <td key={key} className="px-4 py-3">
            <div className="flex items-center gap-1.5">
              <Badge variant={e.isSunkCost ? "gray" : "blue"}>{CAT_LABELS[e.category]}</Badge>
              {e.paidFromPettyCash && <span title="Paid from petty cash"><Wallet size={12} className="text-amber-500" /></span>}
            </div>
          </td>
        );
      case "description":
        return (
          <td key={key} className="px-4 py-3 text-sm font-sans text-gray-500 max-w-[160px]">
            <span title={e.description ?? ""}>{e.description ? (e.description.length > 30 ? e.description.slice(0, 30) + "…" : e.description) : "—"}</span>
            {e.vendor && <p className="text-xs text-gray-400 mt-0.5 truncate">{e.vendor.name}</p>}
          </td>
        );
      case "amount":
        return (
          <td key={key} className="px-4 py-3 text-right">
            <CurrencyDisplay currency={currency} amount={e.amount} size="sm" className={e.isSunkCost ? "text-gray-400 line-through" : "text-expense"} />
            {e.unitAllocations?.length > 1 && (
              <p className="text-xs text-gray-400 font-sans mt-0.5">
                {formatCurrency(e.amount / e.unitAllocations.length, currency)} / unit
              </p>
            )}
          </td>
        );
      case "payment":
        return <td key={key} className="px-4 py-3"><PayBadge status={payStatus} /></td>;
      default:
        return <td key={key} />;
    }
  }

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

        {/* Filter bar */}
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search description..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm font-sans border border-gray-200 rounded-lg bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All scopes</option>
              <option value="UNIT">Unit</option>
              <option value="PROPERTY">Property</option>
              <option value="PORTFOLIO">Portfolio</option>
            </select>
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All payments</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="UNPAID">Unpaid</option>
            </select>
            <select
              value={filterSunk}
              onChange={(e) => setFilterSunk(e.target.value)}
              className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All types</option>
              <option value="op">Operating only</option>
              <option value="sunk">Capital only</option>
            </select>
            {hasFilters && (
              <button
                onClick={() => { setFilterSearch(""); setFilterCategory(""); setFilterScope(""); setFilterPayment(""); setFilterSunk(""); }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-sans transition-colors"
              >
                <X size={12} /> Clear filters
              </button>
            )}
            {hasFilters && (
              <span className="text-xs text-gray-400 font-sans ml-auto">
                {displayEntries.length} of {entries.length} entries
              </span>
            )}
          </div>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Operating Expenses", value: -totalOp, color: "text-expense" },
            { label: "Capital / Sunk Costs", value: -totalSunk, color: "text-gray-500" },
            { label: "Total", value: -(totalOp + totalSunk), color: "text-expense" },
          ].map((s) => (
            <Card key={s.label} padding="sm">
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">{s.label}</p>
              <CurrencyDisplay currency={currency} amount={s.value} className={`block mt-1 ${s.color}`} size="lg" />
            </Card>
          ))}
        </div>

        {/* Outstanding payments banner */}
        {unpaidEntries.length > 0 && !filterPayment && (
          <button
            onClick={() => setFilterPayment("UNPAID")}
            className="w-full flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-left hover:bg-amber-100 transition-colors"
          >
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
            <span className="text-sm font-sans text-amber-800">
              <span className="font-semibold">{unpaidEntries.length} {unpaidEntries.length === 1 ? "expense has" : "expenses have"} outstanding payments</span>
              {" "}totalling {formatCurrency(unpaidTotal, currency)} — click to filter
            </span>
          </button>
        )}

        {/* Bulk action toolbar */}
        {selectedIds.size > 0 && (
          <Card padding="sm" className="border border-gold/40 bg-cream-dark">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-sans font-medium text-header">{selectedIds.size} selected</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={14} /></button>

              <div className="w-px h-5 bg-gray-200" />

              {/* Change category */}
              <div className="flex items-center gap-2">
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="text-sm font-sans border border-gray-200 rounded-md px-2 py-1 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </select>
                <Button size="sm" variant="secondary" loading={bulkSubmitting} onClick={() => bulkCategory && bulkAction("retype")}>Change category</Button>
              </div>

              <div className="w-px h-5 bg-gray-200" />

              <Button size="sm" variant="secondary" loading={bulkSubmitting} onClick={() => bulkAction("mark_sunk")}>Mark as Capital</Button>
              <Button size="sm" variant="secondary" loading={bulkSubmitting} onClick={() => bulkAction("mark_operating")}>Mark as Operating</Button>

              <div className="w-px h-5 bg-gray-200" />

              <Button size="sm" variant="secondary" className="text-expense border-expense/30 hover:bg-expense/5" loading={bulkSubmitting} onClick={() => setBulkDeleteConfirm(true)}>
                <Trash2 size={13} /> Delete selected
              </Button>
            </div>
          </Card>
        )}

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
                <Select label="Scope" tooltip="Unit = affects one apartment (e.g. a repair). Property = shared building cost (e.g. cleaning). Portfolio = applies across all your properties." {...register("scope")} options={[
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
                  tooltip="Categorising correctly helps you spot trends — e.g. rising Maintenance costs may signal ageing fixtures that need replacing."
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
                      {formatCurrency(computedTotal ?? 0, currency)}
                    </div>
                    <input type="hidden" {...register("amount")} />
                  </div>
                ) : (
                  <Input label="Amount" type="number" step="0.01" min="0" {...register("amount")} error={errors.amount?.message} />
                )}
              </div>

              <VendorSelect label="Vendor" tooltip="Link this expense to a contractor or supplier. This helps you track spending per vendor and spot your highest-cost relationships." value={vendorId} onChange={setVendorId} />

              <Input label="Description" {...register("description")} placeholder="Optional description..." />

              {/* Sunk cost */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" {...register("isSunkCost")} className="w-4 h-4 rounded border-gray-300 accent-gold" />
                <span className="text-sm font-sans text-gray-600 flex items-center gap-1.5">
                  Sunk cost / capital item <span className="text-gray-400">(excluded from monthly P&L)</span>
                  <HelpTip text="One-off capital costs like renovations or new appliances. Tick this so they don't distort your monthly profit figures — they appear separately as capital items." />
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
                        Current petty cash balance: {formatCurrency(pettyCashBalance, currency)}
                        {pettyCashBalance < 0 && " ⚠ Deficit — consider topping up"}
                      </span>
                    )}
                    <p className="text-gray-400 mt-0.5">A matching Petty Cash OUT entry will be created automatically.</p>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 pt-4">
                <LineItemsEditor
                  items={lineItems}
                  onChange={setLineItems}
                  taxConfigs={taxConfigs}
                  currency={currency}
                />
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
          ) : displayEntries.length === 0 ? (
            <EmptyState
              title="No expenses"
              description={entries.length === 0 ? "No expenses logged for this month" : "No entries match the current filters"}
              icon={<Receipt size={40} />}
              action={entries.length === 0 ? <Button variant="gold" size="sm" onClick={() => { resetForm(); setShowForm(true); }}><Plus size={14} /> Add Expense</Button> : undefined}
            />
          ) : (
            <>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {displayEntries.map((e: any) => {
                const payStatus = aggregatePayment(e.lineItems);
                return (
                  <div key={e.id} className="px-4 py-3">
                    {/* Top row: date + category badge */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-400 font-sans">{formatDate(e.date)}</span>
                      <Badge variant={e.isSunkCost ? "gray" : "blue"}>{CAT_LABELS[e.category]}</Badge>
                    </div>

                    {/* Description + vendor */}
                    <p className="text-sm font-sans text-header truncate">{e.description ?? "—"}</p>
                    {e.vendor?.name && (
                      <p className="text-xs text-gray-400 font-sans mt-0.5">{e.vendor.name}</p>
                    )}

                    {/* Amount + pay status */}
                    <div className="flex items-center justify-between mt-2">
                      <span className={clsx("text-sm font-mono font-medium", e.isSunkCost ? "text-gray-400 line-through" : "text-expense")}>
                        {formatCurrency(e.amount, currency)}
                      </span>
                      <PayBadge status={payStatus} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 border-t border-gray-50 mt-2 pt-2">
                      <button onClick={() => openEdit(e)} className="text-gray-300 hover:text-gold transition-colors p-1" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleDocPanel(e.id)}
                        className={clsx("relative text-gray-300 hover:text-gold transition-colors p-1", docPanelRows.has(e.id) && "text-gold")}
                        title="Documents"
                      >
                        <Paperclip size={14} />
                        {expenseDocs[e.id]?.length > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-gold text-white text-[9px] font-sans font-bold leading-none">
                            {expenseDocs[e.id].length > 9 ? "9+" : expenseDocs[e.id].length}
                          </span>
                        )}
                      </button>
                      <button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-expense transition-colors p-1" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: scrollable table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-cream-dark">
                  <tr>
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={displayEntries.length > 0 && selectedIds.size === displayEntries.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 accent-gold"
                      />
                    </th>
                    <th className="px-2 py-3 w-6" />
                    {colOrder.map((key) => renderColHeader(key))}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans" />
                  </tr>
                </thead>
                <tbody>
                  {displayEntries.map((e: any) => {
                    const isExpanded = expandedRows.has(e.id);
                    const hasItems = e.lineItems?.length > 0;

                    return (
                      <>
                        <tr key={e.id} className={clsx("border-t border-gray-50 hover:bg-cream/50 transition-colors", selectedIds.has(e.id) && "bg-gold/5")}>
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(e.id)}
                              onChange={() => toggleSelect(e.id)}
                              className="w-4 h-4 rounded border-gray-300 accent-gold"
                            />
                          </td>
                          {/* Expand toggle */}
                          <td className="px-2 py-3 w-6">
                            {hasItems ? (
                              <button onClick={() => toggleRow(e.id)} className="text-gray-300 hover:text-gold transition-colors p-1">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            ) : <span className="w-6 inline-block" />}
                          </td>
                          {colOrder.map((key) => renderColCell(key, e))}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(e)} className="text-gray-300 hover:text-gold transition-colors p-1" title="Edit">
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => toggleDocPanel(e.id)}
                                className={clsx("relative text-gray-300 hover:text-gold transition-colors p-1", docPanelRows.has(e.id) && "text-gold")}
                                title="Documents"
                              >
                                <Paperclip size={14} />
                                {expenseDocs[e.id]?.length > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-gold text-white text-[9px] font-sans font-bold leading-none">
                                    {expenseDocs[e.id].length > 9 ? "9+" : expenseDocs[e.id].length}
                                  </span>
                                )}
                              </button>
                              <button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-expense transition-colors p-1" title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Document panel */}
                        {docPanelRows.has(e.id) && (
                          <tr key={`${e.id}-docs`} className="border-t border-gray-50 bg-cream/20">
                            <td colSpan={colOrder.length + 3} className="px-6 py-4">
                              <div className="space-y-4">
                                <h5 className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                                  <Paperclip size={11} /> Attached Documents
                                </h5>
                                {docLoading.has(e.id) ? (
                                  <div className="flex justify-center py-4"><Spinner /></div>
                                ) : (
                                  <>
                                    <ExpenseDocumentList
                                      expenseId={e.id}
                                      documents={expenseDocs[e.id] ?? []}
                                      onDeleted={() => loadDocs(e.id)}
                                    />
                                    <ExpenseDocumentUpload
                                      expenseId={e.id}
                                      onUploaded={() => loadDocs(e.id)}
                                    />
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Expanded line items */}
                        {isExpanded && hasItems && (
                          <tr key={`${e.id}-expanded`} className="border-t border-gray-50 bg-cream/40">
                            <td colSpan={colOrder.length + 3} className="px-6 pb-4 pt-2">
                              <table className="w-full text-xs font-sans">
                                <thead>
                                  <tr className="text-gray-400 uppercase tracking-wide">
                                    <th className="text-left py-1 pr-4">Type</th>
                                    <th className="text-left py-1 pr-4">Description</th>
                                    <th className="text-right py-1 pr-4">Amount</th>
                                    <th className="text-center py-1 pr-4">Tax</th>
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
                                        {formatCurrency(item.amount, currency)}
                                      </td>
                                      <td className="py-1.5 pr-4 text-center">
                                        {item.isVatable ? (
                                          <span className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-medium">Tax</span>
                                        ) : "—"}
                                      </td>
                                      <td className="py-1.5 pr-4">
                                        <PayBadge status={item.paymentStatus as PayStatus} />
                                      </td>
                                      <td className="py-1.5 pr-4 text-right font-mono text-gray-600">
                                        {item.amountPaid > 0
                                          ? formatCurrency(item.amountPaid, currency)
                                          : "—"}
                                      </td>
                                      <td className="py-1.5 text-gray-500 max-w-[140px] truncate">
                                        {item.paymentReference || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {/* Taxable summary */}
                              {e.lineItems.some((i: any) => i.isVatable) && (
                                <p className="text-xs text-amber-700 font-sans mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 inline-block">
                                  Taxable total: {formatCurrency(e.lineItems.filter((i: any) => i.isVatable).reduce((s: number, i: any) => s + i.amount, 0), currency)}
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
          </>
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
      <ConfirmDialog
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={() => bulkAction("delete")}
        title={`Delete ${selectedIds.size} expenses?`}
        message="These expense entries will be permanently deleted."
        loading={bulkSubmitting}
      />
    </div>
  );
}
