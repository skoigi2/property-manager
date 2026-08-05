"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
  ChevronsUpDown, GripVertical, Paperclip, RepeatIcon,
} from "lucide-react";
import { ExpenseDocumentUpload, type ExpenseDocumentUploadHandle } from "@/components/expenses/ExpenseDocumentUpload";
import { ExportRangeDialog, toYmd, type ExportRange } from "@/components/ui/ExportRangeDialog";
import { ExpenseDocumentList } from "@/components/expenses/ExpenseDocumentList";
import { VendorSelect } from "@/components/ui/VendorSelect";
import { exportExpenses } from "@/lib/excel-export";
import { formatCurrency, formatNumber } from "@/lib/currency";
import { calcExpensePayment } from "@/lib/calculations";
import { clsx } from "clsx";
import { useProperty } from "@/lib/property-context";
import { usePermissions } from "@/lib/use-permissions";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { useSharedMonth } from "@/lib/use-shared-month";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/expense-categories";
import { HistoryDrawer } from "@/components/ui/HistoryDrawer";

// ─── Tax helpers (client-side, mirrors tax-engine pure functions) ─────────────

interface TaxConfigMeta {
  id: string;
  label: string;
  rate: number;
  type: "ADDITIVE" | "WITHHELD";
  appliesTo: string[];
  isInclusive: boolean;
  isActive?: boolean;
  propertyId?: string | null;
  effectiveFrom?: string;
}

/** Mirrors resolveEffectiveTaxConfigs in tax-engine.ts (server is authoritative —
 *  it re-snapshots on save; this only keeps the entry-time preview honest for
 *  backdated expenses): drop rows effective after the expense date, prefer
 *  property-specific over org default, then newest effectiveFrom, one per label:type. */
function resolveEffectiveConfigsClient(configs: TaxConfigMeta[], asOf: Date): TaxConfigMeta[] {
  const cutoff = isNaN(asOf.getTime()) ? Date.now() : asOf.getTime();
  const sorted = configs
    .filter((c) => !c.effectiveFrom || new Date(c.effectiveFrom).getTime() <= cutoff)
    .slice()
    .sort((a, b) => {
      const aProp = a.propertyId ? 1 : 0;
      const bProp = b.propertyId ? 1 : 0;
      if (aProp !== bProp) return bProp - aProp;
      return new Date(b.effectiveFrom ?? 0).getTime() - new Date(a.effectiveFrom ?? 0).getTime();
    });
  const seen = new Set<string>();
  return sorted.filter((c) => {
    const key = `${c.label}:${c.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

const CATEGORIES = EXPENSE_CATEGORIES;
const CAT_LABELS: Record<string, string> = EXPENSE_CATEGORY_LABELS;
const PAYMENT_METHODS = ["BANK_TRANSFER", "MPESA", "CASH", "CARD", "CHEQUE", "OTHER"];
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer", MPESA: "M-Pesa", CASH: "Cash",
  CARD: "Card", CHEQUE: "Cheque", OTHER: "Other",
};
const LINE_CATEGORIES = ["LABOUR", "MATERIAL", "QUOTE"] as const;
type LineCat = typeof LINE_CATEGORIES[number];
type PayStatus = "UNPAID" | "PARTIAL" | "PAID";

// Unit-of-measure dropdown, grouped. Mirrors the UnitOfMeasure enum —
// descriptive context for qty × rate only, never used in a calculation.
const UOM_GROUPS: { label: string; options: [string, string][] }[] = [
  { label: "Count",         options: [["UNIT", "no. / each"], ["ITEM", "item"], ["SET", "set"], ["PAIR", "pair"]] },
  { label: "Weight",        options: [["KG", "kg"], ["G", "g"], ["TONNE", "tonne"]] },
  { label: "Volume",        options: [["LITRE", "litre"], ["ML", "ml"]] },
  { label: "Length",        options: [["M", "m"], ["MM", "mm"]] },
  { label: "Area",          options: [["M2", "m²"]] },
  { label: "Labour / Time", options: [["HOUR", "hour"], ["DAY", "day"], ["TRIP", "trip"]] },
  { label: "Other",         options: [["OTHER", "Other…"]] },
];
const UOM_LABELS: Record<string, string> = Object.fromEntries(UOM_GROUPS.flatMap((g) => g.options));

/** Display label for a line's unit — unitOther text replaces the enum label for OTHER. */
function uomLabel(unit?: string | null, unitOther?: string | null): string {
  if (!unit) return "";
  if (unit === "OTHER") return (unitOther ?? "").trim() || "other";
  return UOM_LABELS[unit] ?? unit;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItemDraft {
  id?: string;
  category: LineCat;
  description: string;
  amount: string;
  // Optional qty × rate mode — when both are filled, amount is derived
  // (round2(qty × rate)) and shown read-only; when blank, amount is typed.
  quantity: string;
  unitRate: string;
  // Unit of measurement for quantity — descriptive only. OTHER reveals the
  // unitOther free-text (AssetCategory/categoryOther pattern).
  unit: string;
  unitOther: string;
  // Informational only — value of a discount received. Amount is already
  // net-of-discount; this never enters any total.
  discountAmount: string;
  isVatable: boolean;
  paymentStatus: PayStatus;
  amountPaid: string;
  paymentReference: string;
}

function blankLine(): LineItemDraft {
  return { category: "LABOUR", description: "", amount: "", quantity: "", unitRate: "", unit: "", unitOther: "", discountAmount: "", isVatable: false, paymentStatus: "UNPAID", amountPaid: "", paymentReference: "" };
}

/** round2(qty × rate) when both fields hold numbers, else null (amount is typed directly). */
function qtyRateDerived(item: Pick<LineItemDraft, "quantity" | "unitRate">): number | null {
  if (item.quantity.trim() === "" || item.unitRate.trim() === "") return null;
  const q = parseFloat(item.quantity);
  const r = parseFloat(item.unitRate);
  if (!isFinite(q) || !isFinite(r) || q <= 0 || r < 0) return null;
  return Math.round(q * r * 100) / 100;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    const next = items.map((item, i) => {
      if (i !== idx) return item;
      const merged = { ...item, ...patch };
      // Qty × rate mode: keep the draft's amount in sync with the derived value
      // so totals + tax preview (which read amount) work unchanged.
      if ("quantity" in patch || "unitRate" in patch) {
        const derived = qtyRateDerived(merged);
        if (derived !== null) merged.amount = String(derived);
      }
      return merged;
    });
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
        <h4 className="text-body font-semibold text-header">Line Items</h4>
        <button type="button" onClick={add} className="flex items-center gap-1 text-caption text-gold hover:text-gold-dark font-medium transition-colors">
          <Plus size={13} /> Add line
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-caption text-gray-400 italic">No line items — the amount above will be used as a single total.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2.5 bg-cream/30">
              {/* Row 1: category + description + amount + VAT */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label className="block text-caption text-gray-400 mb-1">Type</label>
                  <select
                    value={item.category}
                    onChange={(e) => update(idx, { category: e.target.value as LineCat })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  >
                    {LINE_CATEGORIES.map((c) => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}
                  </select>
                </div>
                <div className="col-span-4">
                  <label className="block text-caption text-gray-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    placeholder="e.g. Paint & materials"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-caption text-gray-400 mb-1">
                    Amount{qtyRateDerived(item) !== null && <span className="text-gray-300"> (derived)</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.amount}
                    onChange={(e) => update(idx, { amount: e.target.value })}
                    readOnly={qtyRateDerived(item) !== null}
                    placeholder="0"
                    className={`w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption focus:outline-none focus:ring-1 focus:ring-gold ${
                      qtyRateDerived(item) !== null ? "bg-cream text-gray-500" : "bg-white"
                    }`}
                  />
                </div>
                <div className="col-span-1 flex flex-col items-center gap-1">
                  <label className="block text-caption text-gray-400 ">Tax</label>
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

              {/* Row 1b: optional qty × unit × rate + discount received */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-2">
                  <label className="block text-caption text-gray-400 mb-1">Qty <span className="text-gray-300">(opt.)</span></label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => update(idx, { quantity: e.target.value })}
                    placeholder="e.g. 2.5"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-caption text-gray-400 mb-1">Unit</label>
                  <select
                    value={item.unit}
                    onChange={(e) => update(idx, { unit: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  >
                    <option value="">—</option>
                    {UOM_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {item.unit === "OTHER" && (
                    <input
                      type="text"
                      value={item.unitOther}
                      onChange={(e) => update(idx, { unitOther: e.target.value })}
                      placeholder="Specify unit..."
                      className="mt-2 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                  )}
                </div>
                <div className="col-span-3">
                  <label className="block text-caption text-gray-400 mb-1">Rate <span className="text-gray-300">(per unit)</span></label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitRate}
                    onChange={(e) => update(idx, { unitRate: e.target.value })}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div className="col-span-4">
                  <label className="flex items-center gap-1 text-caption text-gray-400 mb-1">
                    Discount received
                    <HelpTip text="The discount you got off the list price — for vendor-savings reporting only. Amount stays what you were actually charged; this is never subtracted from it." />
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.discountAmount}
                    onChange={(e) => update(idx, { discountAmount: e.target.value })}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>
              {qtyRateDerived(item) !== null && (
                <p className="text-caption text-gray-400">
                  {parseFloat(item.quantity)}{uomLabel(item.unit, item.unitOther) && ` ${uomLabel(item.unit, item.unitOther)}`} × {formatNumber(parseFloat(item.unitRate))} = {formatCurrency(qtyRateDerived(item)!, currency)}
                </p>
              )}

              {/* Tax badge */}
              {itemTax[idx] && (
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption border ${
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
                <p className="text-caption text-gray-400 italic">No matching tax rule for this category.</p>
              )}

              {/* Row 2: payment status */}
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-caption text-gray-400 mb-1">Payment</label>
                  <select
                    value={item.paymentStatus}
                    onChange={(e) => update(idx, { paymentStatus: e.target.value as PayStatus, amountPaid: e.target.value === "PAID" ? item.amount : item.amountPaid })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                  >
                    <option value="UNPAID">Unpaid</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="PAID">Paid</option>
                  </select>
                </div>
                {(item.paymentStatus === "PARTIAL" || item.paymentStatus === "PAID") && (
                  <div>
                    <label className="block text-caption text-gray-400 mb-1">Amount Paid</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.amountPaid}
                      onChange={(e) => update(idx, { amountPaid: e.target.value })}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                  </div>
                )}
                {(item.paymentStatus === "PARTIAL" || item.paymentStatus === "PAID") && (
                  <div>
                    <label className="block text-caption text-gray-400 mb-1">Payment Reference</label>
                    <input
                      type="text"
                      value={item.paymentReference}
                      onChange={(e) => update(idx, { paymentReference: e.target.value })}
                      placeholder="e.g. M-PESA ref, bank transfer"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-caption bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Totals row */}
          <div className="flex items-center justify-between px-1 text-caption ">
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
              <p className="text-label font-semibold text-amber-800 uppercase ">Tax Summary</p>
              {inputVatAdditive > 0 && (
                <div className="flex items-center justify-between text-caption ">
                  <span className="text-gray-600">Input VAT / GST (reclaimable)</span>
                  <span className="font-medium text-blue-700">{formatCurrency(inputVatAdditive, currency)}</span>
                </div>
              )}
              {whtWithheld > 0 && (
                <div className="flex items-center justify-between text-caption ">
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
  const { selectedId, selected } = useProperty();
  const canDelete = usePermissions().can("FINANCIAL_DELETE");
  const currency = useProperty().currency;
  const searchParams = useSearchParams();
  // The header context list is minimal (?minimal=true — no units), so the
  // unit multi-select must load the full property list itself. Same cache
  // key as the Tenants page, so repeat navigations render instantly.
  const { data: fullProperties } = useCachedFetch<any[]>("properties:full", "/api/properties");
  const properties = fullProperties ?? [];
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [month, setMonth] = useSharedMonth();

  // Month entries — cached per (month, property) so navigating back to a
  // recently viewed month renders instantly, with a background refresh.
  const entriesQs = (() => {
    const p = new URLSearchParams({ year: String(month.getFullYear()), month: String(month.getMonth() + 1) });
    if (selectedId) p.set("propertyId", selectedId);
    return p.toString();
  })();
  const { data: entriesData, loading, refresh: refreshEntries, setData: setEntriesData } =
    useCachedFetch<any[]>(`expenses:${entriesQs}`, `/api/expenses?${entriesQs}`);
  const entries = entriesData ?? [];
  const [showForm, setShowForm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const receiptUploaderRef = useRef<ExpenseDocumentUploadHandle>(null);
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
  const [filterReceipts, setFilterReceipts] = useState("");
  const [filterSunk, setFilterSunk] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  // "Delete all" (every month) for the current property scope
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deleteAllCount, setDeleteAllCount] = useState<number | null>(null);
  const [deleteAllSubmitting, setDeleteAllSubmitting] = useState(false);

  // Sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Column order (draggable), persisted to localStorage
  const DEFAULT_COL_ORDER = ["date", "unit", "property", "category", "description", "amount", "payment", "balance", "due"];
  const [colOrder, setColOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COL_ORDER;
    try {
      const saved = localStorage.getItem("expenses-col-order");
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        // Append any newly-added default columns the saved order predates.
        const merged = [...parsed, ...DEFAULT_COL_ORDER.filter((c) => !parsed.includes(c))];
        return merged;
      }
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
  const wCategory = watch("category");
  const wAmount = watch("amount");
  const wDate = watch("date");

  // Configs in force on the typed expense date — keeps the entry-time tax
  // preview honest for backdated entries (the server re-resolves on save;
  // stored taxAmount snapshots are never recomputed on read).
  const effectiveTaxConfigs = useMemo(
    () => (taxConfigs ? resolveEffectiveConfigsClient(taxConfigs, wDate ? new Date(wDate) : new Date()) : null),
    [taxConfigs, wDate],
  );
  const allUnits = useMemo(
    () =>
      properties.flatMap((p: any) =>
        (p.units ?? []).map((u: any) => ({ ...u, propertyName: p.name, propertyId: p.id }))
      ),
    [properties],
  );
  // Scope the checkbox list to the header-selected property, but always keep
  // units that are already checked (editing a cross-property expense must not
  // hide its own units). A search box narrows further for large buildings.
  const [unitSearch, setUnitSearch] = useState("");
  const visibleUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    return allUnits.filter((u: any) => {
      if (selectedUnitIds.includes(u.id)) return true;
      if (selectedId && u.propertyId !== selectedId) return false;
      if (q && !`${u.unitNumber} ${u.propertyName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allUnits, selectedId, selectedUnitIds, unitSearch]);

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

  // Bulk selection is scoped to the visible month/property — clear on change.
  useEffect(() => { setSelectedIds(new Set()); }, [month, selectedId]);

  const resetForm = useCallback(() => {
    reset({ scope: "UNIT", isSunkCost: false, paidFromPettyCash: false, amount: 0 });
    setEditEntry(null);
    setSelectedUnitIds([]);
    setLineItems([]);
    setVendorId(null);
    setUnitSearch("");
    setShowForm(false);
  }, [reset]);

  // Deep-link prefill from the Petty Cash page's "Record as expense instead"
  // nudge — opens the form with the typed values and the petty-cash flag on.
  const prefillDone = useRef(false);
  useEffect(() => {
    if (prefillDone.current) return;
    if (searchParams.get("prefill") !== "petty") return;
    prefillDone.current = true;
    const propertyId = searchParams.get("propertyId") ?? "";
    reset({
      scope: propertyId ? "PROPERTY" : "PORTFOLIO",
      propertyId: propertyId || undefined,
      date: searchParams.get("date") || new Date().toISOString().split("T")[0],
      amount: Number(searchParams.get("amount")) || 0,
      description: searchParams.get("description") ?? "",
      category: "OTHER",
      isSunkCost: false,
      paidFromPettyCash: true,
    } as any);
    setEditEntry(null);
    setShowForm(true);
  }, [searchParams, reset]);

  // Soft duplicate check (create mode only): an entry with the same category
  // and amount within ±3 days of the typed date probably means double entry.
  const duplicateCandidate = useMemo(() => {
    if (editEntry || !showForm) return null;
    const amt = Number(wAmount);
    if (!wCategory || !wDate || !amt) return null;
    const target = new Date(wDate).getTime();
    if (isNaN(target)) return null;
    const DAY = 86_400_000;
    return entries.find((e: any) =>
      e.category === wCategory &&
      Math.abs(e.amount - amt) < 0.005 &&
      Math.abs(new Date(e.date).getTime() - target) <= 3 * DAY,
    ) ?? null;
  }, [editEntry, showForm, wCategory, wAmount, wDate, entries]);

  function openEdit(e: any) {
    setEditEntry(e);
    // Load attached receipts so the form's gallery shows them.
    if (!expenseDocs[e.id]) loadDocs(e.id);
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
      amountPaid: e.amountPaid ?? 0,
      dueDate: e.dueDate ? new Date(e.dueDate).toISOString().split("T")[0] : "",
      vatAmount: e.vatAmount ?? undefined,
      discountAmount: e.discountAmount ?? undefined,
      paymentMethod: e.paymentMethod ?? undefined,
      paymentReference: e.paymentReference ?? "",
      paymentDate: e.paymentDate ? new Date(e.paymentDate).toISOString().split("T")[0] : "",
      notes: e.notes ?? "",
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
        quantity: item.quantity != null ? String(item.quantity) : "",
        unitRate: item.unitRate != null ? String(item.unitRate) : "",
        unit: item.unit ?? "",
        unitOther: item.unitOther ?? "",
        discountAmount: item.discountAmount != null ? String(item.discountAmount) : "",
        isVatable: item.isVatable,
        paymentStatus: item.paymentStatus as PayStatus,
        amountPaid: String(item.amountPaid),
        paymentReference: item.paymentReference ?? "",
      }))
    );
    setVendorId(e.vendorId ?? null);
    setUnitSearch("");
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
        lineItems: lineItems.map((item) => {
          const q = parseFloat(item.quantity);
          const r = parseFloat(item.unitRate);
          const d = parseFloat(item.discountAmount);
          return {
          id: item.id,
          category: item.category,
          description: item.description || undefined,
          amount: parseFloat(item.amount) || 0,
          // Only send the qty×rate pair when both are valid — the server then
          // derives amount = round2(qty × rate) and stores all three.
          quantity: isFinite(q) && q > 0 ? q : undefined,
          unitRate: isFinite(r) && r >= 0 && item.unitRate.trim() !== "" ? r : undefined,
          unit: item.unit || undefined,
          unitOther: item.unit === "OTHER" && item.unitOther.trim() ? item.unitOther.trim() : undefined,
          discountAmount: isFinite(d) && d > 0 ? d : undefined,
          isVatable: item.isVatable,
          paymentStatus: item.paymentStatus,
          amountPaid: parseFloat(item.amountPaid) || 0,
          paymentReference: item.paymentReference || undefined,
          };
        }),
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
        setEntriesData((prev) => (prev ?? []).map((e) => (e.id === saved.id ? saved : e)));
        toast.success("Expense updated");
      } else {
        setEntriesData((prev) => [saved, ...(prev ?? [])]);
        toast.success(data.paidFromPettyCash ? "Expense saved & petty cash debited" : "Expense added");
        // Deferred receipts: files queued in the create form upload now that
        // the expense id exists. Must run before resetForm unmounts the uploader.
        if (receiptUploaderRef.current?.hasQueued()) {
          const { done, failed } = await receiptUploaderRef.current.uploadAllTo(saved.id);
          if (done > 0) {
            await loadDocs(saved.id);
            toast.success(`${done} receipt${done !== 1 ? "s" : ""} attached`);
          }
          if (failed.length > 0) {
            toast.error(`${failed.length} receipt${failed.length !== 1 ? "s" : ""} failed to upload: ${failed.join("; ")}`, { duration: 9000 });
          }
        }
      }
      resetForm();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  // Range export: fetch the chosen period fresh from the API (not just the
  // month on screen) and hand it to the same styled Excel generator.
  async function handleRangeExport(range: ExportRange) {
    try {
      const params = new URLSearchParams({ limit: "20000" });
      if (selectedId) params.set("propertyId", selectedId);
      if (range.from) params.set("from", toYmd(range.from));
      if (range.to) params.set("to", toYmd(range.to));
      const res = await fetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error();
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        toast.error("No expenses in that period");
        return;
      }
      exportExpenses(rows, month, currency, range.label);
      toast.success(`Exported ${rows.length} expense${rows.length !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Export failed");
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/expenses/${deleteId}`, { method: "DELETE" });
      setEntriesData((prev) => (prev ?? []).filter((e) => e.id !== deleteId));
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

  async function bulkAction(action: "delete" | "retype" | "mark_sunk" | "mark_operating" | "mark_paid") {
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
      if (!res.ok) {
        // Surface the server's message when it's a plain string (permission
        // denials etc.); zod flatten() errors are objects — keep the generic.
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error : undefined);
      }
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      await refreshEntries(); // re-sync the cached month list
      toast.success(action === "delete" ? "Entries deleted" : "Entries updated");
    } catch (err) { toast.error((err as Error)?.message || "Bulk action failed"); }
    finally { setBulkSubmitting(false); }
  }

  // Open the "delete all" confirm — fetch the across-all-months count first so
  // the dialog can state exactly how many entries will be removed.
  async function openDeleteAll() {
    setDeleteAllCount(null);
    setDeleteAllConfirm(true);
    try {
      const params = new URLSearchParams({ count: "true" });
      if (selectedId) params.set("propertyId", selectedId);
      const res = await fetch(`/api/expenses?${params}`).then((r) => r.json());
      setDeleteAllCount(typeof res?.count === "number" ? res.count : null);
    } catch { setDeleteAllCount(null); }
  }

  async function deleteAllExpenses() {
    setDeleteAllSubmitting(true);
    try {
      const res = await fetch("/api/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_all", ...(selectedId ? { propertyId: selectedId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : undefined);
      setDeleteAllConfirm(false);
      setSelectedIds(new Set());
      await refreshEntries(); // re-sync the cached month list
      toast.success(`Deleted ${data.count} expense${data.count === 1 ? "" : "s"}`);
    } catch (err) { toast.error((err as Error)?.message || "Delete all failed"); }
    finally { setDeleteAllSubmitting(false); }
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

  // Payment status/outstanding computed ONCE per row — the sort comparator,
  // banner totals, and every cell/card read `e.pay` instead of re-deriving.
  const entriesWithPay = useMemo(
    () => entries.map((e: any) => ({ ...e, pay: calcExpensePayment(e) })),
    [entries],
  );

  // Filtered + sorted entries for table display (KPI cards always use full `entries`)
  const displayEntries = useMemo(() => {
    let result = entriesWithPay
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
      .filter((e: any) => !filterPayment || e.pay.status === filterPayment)
      .filter((e: any) => {
        if (!filterReceipts) return true;
        const docCount = expenseDocs[e.id]?.length ?? e._count?.documents ?? 0;
        return filterReceipts === "missing" ? docCount === 0 : docCount > 0;
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
          cmp = (order[a.pay.status as keyof typeof order] ?? 3) - (order[b.pay.status as keyof typeof order] ?? 3);
        } else if (sortCol === "balance") {
          cmp = a.pay.outstanding - b.pay.outstanding;
        } else if (sortCol === "due") {
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          cmp = da - db;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [entriesWithPay, filterSearch, filterCategory, filterScope, filterSunk, filterPayment, filterReceipts, expenseDocs, sortCol, sortDir]);

  const hasFilters = !!(filterSearch || filterCategory || filterScope || filterPayment || filterSunk || filterReceipts);

  // Outstanding payments — over ALL month entries, not the filtered view
  const { unpaidEntries, unpaidTotal, overdueEntries, overdueTotal } = useMemo(() => {
    const nowTs = Date.now();
    const unpaid = entriesWithPay.filter((e: any) => e.pay.status !== "PAID");
    const overdue = unpaid.filter((e: any) => e.dueDate && new Date(e.dueDate).getTime() < nowTs);
    return {
      unpaidEntries: unpaid,
      unpaidTotal: unpaid.reduce((s: number, e: any) => s + e.pay.outstanding, 0),
      overdueEntries: overdue,
      overdueTotal: overdue.reduce((s: number, e: any) => s + e.pay.outstanding, 0),
    };
  }, [entriesWithPay]);

  const hasLineItems = lineItems.length > 0;
  const computedTotal = hasLineItems
    ? lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
    : null;

  const SORTABLE_COLS = new Set(["date", "property", "category", "description", "amount", "payment", "balance", "due"]);
  const COL_LABELS: Record<string, string> = {
    date: "Date", unit: "Unit/Scope", property: "Property",
    category: "Category", description: "Description", amount: "Amount", payment: "Payment",
    balance: "Balance", due: "Due",
  };

  // Shared by the drag-drop handler and the keyboard (arrow-key) path.
  function moveColTo(fromKey: string, toKey: string) {
    const next = [...colOrder];
    const from = next.indexOf(fromKey);
    const to = next.indexOf(toKey);
    if (from === -1 || to === -1) return;
    next.splice(from, 1);
    next.splice(to, 0, fromKey);
    setColOrder(next);
    localStorage.setItem("expenses-col-order", JSON.stringify(next));
  }

  function moveColBy(key: string, delta: -1 | 1) {
    const idx = colOrder.indexOf(key);
    const target = colOrder[idx + delta];
    if (target) moveColTo(key, target);
  }

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
          moveColTo(fromKey, key);
          setDragOverCol(null);
        }}
        onDragLeave={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOverCol(null);
        }}
        className={clsx(
          "px-4 py-3 text-left text-label font-medium text-gray-400 uppercase select-none",
          dragOverCol === key && "border-l-2 border-gold bg-gold/5"
        )}
      >
        <span className="flex items-center gap-1">
          {/* Drag handle — also keyboard-reorderable (focus + arrow keys) */}
          <span
            draggable
            role="button"
            tabIndex={0}
            aria-label={`Move ${COL_LABELS[key]} column — press left or right arrow`}
            onKeyDown={(ev) => {
              if (ev.key === "ArrowLeft")  { ev.preventDefault(); moveColBy(key, -1); }
              if (ev.key === "ArrowRight") { ev.preventDefault(); moveColBy(key, 1); }
            }}
            onDragStart={(ev) => {
              ev.dataTransfer.setData("text/plain", key);
              ev.dataTransfer.effectAllowed = "move";
              // Use the parent <th> as the drag image for better UX
              const th = ev.currentTarget.closest("th");
              if (th) ev.dataTransfer.setDragImage(th, th.offsetWidth / 2, th.offsetHeight / 2);
              setDragCol(key);
            }}
            onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
            className="cursor-grab text-gray-300 hover:text-gray-500 focus:text-gold focus:outline-none focus:ring-1 focus:ring-gold/50 rounded flex-shrink-0 pr-0.5"
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
    const pay = e.pay ?? calcExpensePayment(e);
    const payStatus = pay.status;
    const propName = propertyLabel(e);
    const isOverdue = e.dueDate && pay.status !== "PAID" && new Date(e.dueDate).getTime() < Date.now();
    switch (key) {
      case "date":
        return <td key={key} className="px-4 py-3 text-body text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>;
      case "unit":
        return <td key={key} className="px-4 py-3 text-body tabular-nums text-gray-500">{unitLabel(e)}</td>;
      case "property":
        return <td key={key} className="px-4 py-3"><Badge variant={propName === "All Properties" ? "gray" : "blue"}>{propName}</Badge></td>;
      case "category":
        return (
          <td key={key} className="px-4 py-3">
            <div className="flex items-center gap-1.5">
              <Badge variant={e.isSunkCost ? "gray" : "blue"}>{CAT_LABELS[e.category]}</Badge>
              {e.paidFromPettyCash && <span title="Paid from petty cash"><Wallet size={12} className="text-amber-500" /></span>}
              {e.recurringExpenseId && <span title="Created by a recurring expense template"><RepeatIcon size={12} className="text-gold" /></span>}
            </div>
          </td>
        );
      case "description":
        return (
          <td key={key} className="px-4 py-3 text-body text-gray-500 max-w-[160px]">
            <span title={e.description ?? ""}>{e.description ? (e.description.length > 30 ? e.description.slice(0, 30) + "…" : e.description) : "—"}</span>
            {e.vendor && <p className="text-caption text-gray-400 mt-0.5 truncate">{e.vendor.name}</p>}
          </td>
        );
      case "amount":
        return (
          <td key={key} className="px-4 py-3 text-right">
            <CurrencyDisplay currency={currency} amount={e.amount} size="sm" className={e.isSunkCost ? "text-gray-400 line-through" : "text-expense"} />
            {e.vatAmount > 0 && (
              <p className="text-caption text-gray-400 mt-0.5">+ VAT {formatCurrency(e.vatAmount, currency)}</p>
            )}
            {e.unitAllocations?.length > 1 && (
              <p className="text-caption text-gray-400 mt-0.5">
                {formatCurrency(e.amount / e.unitAllocations.length, currency)} / unit
              </p>
            )}
          </td>
        );
      case "payment":
        return <td key={key} className="px-4 py-3"><PayBadge status={payStatus} /></td>;
      case "balance":
        return (
          <td key={key} className="px-4 py-3 text-right">
            {pay.outstanding > 0
              ? <span className="text-body tabular-nums text-expense">{formatCurrency(pay.outstanding, currency)}</span>
              : <span className="text-caption text-gray-300">—</span>}
          </td>
        );
      case "due":
        return (
          <td key={key} className="px-4 py-3 text-body whitespace-nowrap">
            {e.dueDate
              ? <span className={isOverdue ? "text-expense font-medium" : "text-gray-500"}>{formatDate(e.dueDate)}{isOverdue && " ⚠"}</span>
              : <span className="text-caption text-gray-300">—</span>}
          </td>
        );
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
              className="text-caption text-gold hover:text-gold-dark font-medium underline underline-offset-2 transition-colors"
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
                className="w-full pl-8 pr-3 py-1.5 text-body border border-gray-200 rounded-lg bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-body border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="text-body border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All scopes</option>
              <option value="UNIT">Unit</option>
              <option value="PROPERTY">Property</option>
              <option value="PORTFOLIO">Portfolio</option>
            </select>
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="text-body border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All payments</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="UNPAID">Unpaid</option>
            </select>
            <select
              value={filterSunk}
              onChange={(e) => setFilterSunk(e.target.value)}
              className="text-body border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All types</option>
              <option value="op">Operating only</option>
              <option value="sunk">Capital only</option>
            </select>
            <select
              value={filterReceipts}
              onChange={(e) => setFilterReceipts(e.target.value)}
              title="Filter by attached receipts/documents"
              className="text-body border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All receipts</option>
              <option value="missing">Missing receipt</option>
              <option value="has">Has receipt</option>
            </select>
            {hasFilters && (
              <button
                onClick={() => { setFilterSearch(""); setFilterCategory(""); setFilterScope(""); setFilterPayment(""); setFilterSunk(""); setFilterReceipts(""); }}
                className="flex items-center gap-1 text-caption text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={12} /> Clear filters
              </button>
            )}
            {hasFilters && (
              <span className="text-caption text-gray-400 ml-auto">
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
              <p className="text-label text-gray-400 uppercase ">{s.label}</p>
              <CurrencyDisplay currency={currency} amount={s.value} className={`block mt-1 ${s.color}`} size="lg" />
            </Card>
          ))}
        </div>

        {/* Outstanding payments banner */}
        {unpaidEntries.length > 0 && !filterPayment && (
          <button
            onClick={() => setFilterPayment("UNPAID")}
            className={clsx(
              "w-full flex items-center gap-2.5 px-4 py-3 border rounded-xl text-left transition-colors",
              overdueEntries.length > 0
                ? "bg-expense/5 border-expense/30 hover:bg-expense/10"
                : "bg-amber-50 border-amber-200 hover:bg-amber-100"
            )}
          >
            <AlertTriangle size={15} className={clsx("flex-shrink-0", overdueEntries.length > 0 ? "text-expense" : "text-amber-600")} />
            <span className={clsx("text-body ", overdueEntries.length > 0 ? "text-expense" : "text-amber-800")}>
              <span className="font-semibold">{unpaidEntries.length} {unpaidEntries.length === 1 ? "expense has" : "expenses have"} outstanding payments</span>
              {" "}totalling {formatCurrency(unpaidTotal, currency)}
              {overdueEntries.length > 0 && <> — including <span className="font-semibold">{formatCurrency(overdueTotal, currency)} overdue</span></>}
              {" "}— click to filter
            </span>
          </button>
        )}

        {/* Bulk action toolbar */}
        {selectedIds.size > 0 && (
          <Card padding="sm" className="border border-gold/40 bg-cream-dark">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-body font-medium text-header">{selectedIds.size} selected</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={14} /></button>

              <div className="w-px h-5 bg-gray-200" />

              {/* Change category */}
              <div className="flex items-center gap-2">
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="text-body border border-gray-200 rounded-md px-2 py-1 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
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

              <Button
                size="sm"
                variant="secondary"
                className="text-income border-income/30 hover:bg-income/5"
                loading={bulkSubmitting}
                title="Settle each selected expense in full — sets amount paid to the total (line items included) with today's payment date"
                onClick={() => bulkAction("mark_paid")}
              >
                <CheckCircle2 size={13} /> Mark paid
              </Button>

              {canDelete && (<>
              <div className="w-px h-5 bg-gray-200" />

              <Button size="sm" variant="secondary" className="text-expense border-expense/30 hover:bg-expense/5" loading={bulkSubmitting} onClick={() => setBulkDeleteConfirm(true)}>
                <Trash2 size={13} /> Delete selected
              </Button>
              </>)}
            </div>
          </Card>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="section-header">Entries</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExport(true)}
              title="Export to Excel — pick a period or all history"
              className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
            >
              <FileDown size={13} /> Export
            </button>
            {canDelete && (
            <button
              onClick={openDeleteAll}
              title={`Delete every expense for ${selected?.name ?? "all properties"} across all months`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium text-expense border border-expense/30 rounded-lg hover:bg-expense/5 transition-colors"
            >
              <Trash2 size={13} /> Delete all
            </button>
            )}
            <Button onClick={() => { if (showForm && !editEntry) { resetForm(); } else { resetForm(); setShowForm(true); } }} size="sm" variant="gold">
              <Plus size={15} /> Add Expense
            </Button>
          </div>
        </div>

        {/* Add / Edit Form — right-hand slide-over (HistoryDrawer pattern) so
            the table stays visible and edits never open off-screen. Backdrop
            click deliberately does NOT close: a misclick must not wipe a
            half-filled form — close via ✕ or Cancel. */}
        {showForm && (
          <div className="fixed inset-0 z-[90] flex justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                <h3 className=" text-h3 text-header">
                  {editEntry ? "Edit Expense" : "New Expense"}
                </h3>
                <button
                  type="button"
                  onClick={resetForm}
                  aria-label="Close"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
                  <label className="block text-body font-medium text-gray-700 mb-1.5">
                    Units <span className="text-gray-400 ">(select one or more — cost split equally)</span>
                  </label>
                  {allUnits.length > 6 && (
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={unitSearch}
                        onChange={(e) => setUnitSearch(e.target.value)}
                        placeholder="Search units..."
                        className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40"
                      />
                    </div>
                  )}
                  <div className="border border-gray-200 rounded-xl p-3 max-h-44 overflow-y-auto space-y-1.5 bg-white">
                    {visibleUnits.length === 0 && (
                      <p className="text-caption text-gray-400 ">
                        {allUnits.length === 0 ? "No units available" : "No units match your search"}
                      </p>
                    )}
                    {visibleUnits.map((u: any) => (
                      <label key={u.id} className="flex items-center gap-2.5 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          checked={selectedUnitIds.includes(u.id)}
                          onChange={() => toggleUnit(u.id)}
                          className="w-4 h-4 rounded accent-gold flex-shrink-0"
                        />
                        <span className="text-body text-gray-700 group-hover:text-header transition-colors">
                          <span className="tabular-nums">{u.unitNumber}</span>
                          <span className="text-gray-400 ml-1">({u.propertyName})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedUnitIds.length > 1 && (
                    <p className="text-caption text-gold mt-1.5 font-medium">
                      {selectedUnitIds.length} units selected — total split equally (each gets {Math.round(100 / selectedUnitIds.length)}%)
                    </p>
                  )}
                </div>
              )}

              {/* Property dropdown — scoped to the header selection (plus the
                  entry's own property when editing); all when no selection */}
              {scope === "PROPERTY" && (
                <Select
                  label="Property"
                  placeholder="Select property..."
                  {...register("propertyId")}
                  options={properties
                    .filter((p: any) => !selectedId || p.id === selectedId || p.id === editEntry?.propertyId)
                    .map((p: any) => ({ value: p.id, label: p.name }))}
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
                    <label className="block text-body font-medium text-gray-700 mb-1.5">
                      Total Amount <span className="text-gray-400 ">(computed)</span>
                    </label>
                    <div className="border border-gray-200 rounded-xl px-3 py-2 bg-cream tabular-nums text-body text-header">
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

              {/* With line items, the per-item payment/tax fields take over —
                  the API clears expense-level vatAmount/amountPaid on save */}
              {hasLineItems && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-caption text-amber-800">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Line items now drive the amounts paid and tax for this expense.
                    Any manual Amount Paid / VAT entered above will be cleared on save.
                  </span>
                </div>
              )}

              {/* Payment tracking — only for single-amount expenses (line items track their own paid amounts) */}
              {!hasLineItems && (
                <div className="space-y-4 rounded-xl border border-gray-100 bg-cream/40 p-3">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Amount Paid"
                      tooltip="How much of this expense has been settled. Leave at 0 for an unpaid bill; the difference shows as an outstanding balance."
                      type="number" step="0.01" min="0"
                      {...register("amountPaid")}
                      error={errors.amountPaid?.message}
                    />
                    <Input
                      label="Due Date"
                      tooltip="When payment is due. Expenses past their due date with a balance owing are flagged as overdue."
                      type="date"
                      {...register("dueDate")}
                      error={errors.dueDate?.message}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Payment Method"
                      placeholder="—"
                      {...register("paymentMethod")}
                      options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
                    />
                    <Input
                      label="Payment Date"
                      tooltip="The date the payment was actually made (may differ from the invoice date)."
                      type="date"
                      {...register("paymentDate")}
                      error={errors.paymentDate?.message}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Payment Reference"
                      tooltip="Cheque number, M-Pesa code, or bank reference for this payment."
                      {...register("paymentReference")}
                      placeholder="e.g. M-Pesa code / cheque no."
                    />
                    <Input
                      label="VAT Amount"
                      tooltip="The VAT/tax portion of this expense. Amount stays net (pre-VAT); this is recorded separately."
                      type="number" step="0.01" min="0"
                      {...register("vatAmount")}
                      error={errors.vatAmount?.message}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Discount Received"
                      tooltip="The discount you got off the list price — recorded for vendor-savings reporting only. Amount stays what you were actually charged (already net of discount); this is never added to or subtracted from any total."
                      type="number" step="0.01" min="0"
                      {...register("discountAmount")}
                      error={errors.discountAmount?.message}
                    />
                  </div>
                </div>
              )}

              <Input label="Notes" tooltip="Internal comments about this expense — not shown to owners or tenants." {...register("notes")} placeholder="Optional comments..." />

              {/* Sunk cost */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" {...register("isSunkCost")} className="w-4 h-4 rounded border-gray-300 accent-gold" />
                <span className="text-body text-gray-600 flex items-center gap-1.5">
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
                    <span className="text-body text-gray-700 font-medium">Paid from petty cash</span>
                  </div>
                </label>
                {paidFromPettyCash && (
                  <div className="pl-7 text-caption ">
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
                  taxConfigs={effectiveTaxConfigs}
                  currency={currency}
                />
              </div>

              {/* Possible duplicate warning (soft — saving is still allowed) */}
              {duplicateCandidate && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-caption text-amber-800">
                    Possible duplicate: <strong>{duplicateCandidate.description || CAT_LABELS[duplicateCandidate.category]}</strong> on{" "}
                    {formatDate(duplicateCandidate.date)} for {formatCurrency(duplicateCandidate.amount, currency)} already
                    exists. You can still save if this is a separate cost.
                  </p>
                </div>
              )}

              {/* Receipts & documents */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-label font-semibold text-gray-400 uppercase flex items-center gap-1.5">
                  <Paperclip size={11} /> Receipts &amp; Documents
                </p>
                {editEntry ? (
                  <>
                    {(expenseDocs[editEntry.id]?.length ?? 0) > 0 && (
                      <ExpenseDocumentList
                        expenseId={editEntry.id}
                        documents={expenseDocs[editEntry.id] ?? []}
                        onDeleted={() => loadDocs(editEntry.id)}
                      />
                    )}
                    <ExpenseDocumentUpload
                      expenseId={editEntry.id}
                      onUploaded={() => loadDocs(editEntry.id)}
                      existingFiles={(expenseDocs[editEntry.id] ?? []).map((d: any) => ({ fileName: d.fileName, fileSize: d.fileSize }))}
                    />
                  </>
                ) : (
                  <ExpenseDocumentUpload ref={receiptUploaderRef} />
                )}
              </div>

                </div>
                {/* Sticky footer — actions always visible however long the form */}
                <div className="flex gap-3 px-5 py-4 border-t border-gray-100 bg-white flex-shrink-0">
                  <Button type="submit" loading={submitting}>{editEntry ? "Update Expense" : "Save Expense"}</Button>
                  <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
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
                const pay = e.pay ?? calcExpensePayment(e);
                const payStatus = pay.status;
                const mIsOverdue = e.dueDate && pay.status !== "PAID" && new Date(e.dueDate).getTime() < Date.now();
                return (
                  <div key={e.id} className="px-4 py-3">
                    {/* Top row: date + category badge */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-caption text-gray-400 ">{formatDate(e.date)}</span>
                      <span className="flex items-center gap-1.5">
                        {e.recurringExpenseId && <span title="Created by a recurring expense template"><RepeatIcon size={12} className="text-gold" /></span>}
                        <Badge variant={e.isSunkCost ? "gray" : "blue"}>{CAT_LABELS[e.category]}</Badge>
                      </span>
                    </div>

                    {/* Description + vendor */}
                    <p className="text-body text-header truncate">{e.description ?? "—"}</p>
                    {e.vendor?.name && (
                      <p className="text-caption text-gray-400 mt-0.5">{e.vendor.name}</p>
                    )}

                    {/* Amount + pay status */}
                    <div className="flex items-center justify-between mt-2">
                      <span className={clsx("text-body tabular-nums font-medium", e.isSunkCost ? "text-gray-400 line-through" : "text-expense")}>
                        {formatCurrency(e.amount, currency)}
                      </span>
                      <PayBadge status={payStatus} />
                    </div>

                    {/* Outstanding balance + due date */}
                    {(pay.outstanding > 0 || e.dueDate) && (
                      <div className="flex items-center justify-between mt-1 text-caption ">
                        {pay.outstanding > 0
                          ? <span className="text-expense">Balance {formatCurrency(pay.outstanding, currency)}</span>
                          : <span />}
                        {e.dueDate && (
                          <span className={mIsOverdue ? "text-expense font-medium" : "text-gray-400"}>
                            Due {formatDate(e.dueDate)}{mIsOverdue && " ⚠"}
                          </span>
                        )}
                      </div>
                    )}

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
                        {(expenseDocs[e.id]?.length ?? e._count?.documents ?? 0) > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-gold text-white text-label font-semibold ">
                            {(expenseDocs[e.id]?.length ?? e._count?.documents) > 9 ? "9+" : (expenseDocs[e.id]?.length ?? e._count?.documents)}
                          </span>
                        )}
                      </button>
                      {canDelete && (
                      <button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-expense transition-colors p-1" title="Delete">
                        <Trash2 size={14} />
                      </button>
                      )}
                    </div>

                    {/* Receipts panel (mobile) */}
                    {docPanelRows.has(e.id) && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-4">
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
                              existingFiles={(expenseDocs[e.id] ?? []).map((d: any) => ({ fileName: d.fileName, fileSize: d.fileSize }))}
                            />
                          </>
                        )}
                      </div>
                    )}
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
                    <th className="px-4 py-3 text-left text-label font-medium text-gray-400 uppercase " />
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
                                {(expenseDocs[e.id]?.length ?? e._count?.documents ?? 0) > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-gold text-white text-label font-semibold ">
                                    {(expenseDocs[e.id]?.length ?? e._count?.documents) > 9 ? "9+" : (expenseDocs[e.id]?.length ?? e._count?.documents)}
                                  </span>
                                )}
                              </button>
                              <button onClick={() => setHistoryId(e.id)} className="text-gray-300 hover:text-gold transition-colors p-1" title="Change history">
                                <Clock size={14} />
                              </button>
                              {canDelete && (
                              <button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-expense transition-colors p-1" title="Delete">
                                <Trash2 size={14} />
                              </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Document panel */}
                        {docPanelRows.has(e.id) && (
                          <tr key={`${e.id}-docs`} className="border-t border-gray-50 bg-cream/20">
                            <td colSpan={colOrder.length + 3} className="px-6 py-4">
                              <div className="space-y-4">
                                <h5 className="text-label font-semibold text-gray-400 uppercase flex items-center gap-1.5">
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
                                      existingFiles={(expenseDocs[e.id] ?? []).map((d: any) => ({ fileName: d.fileName, fileSize: d.fileSize }))}
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
                              <table className="w-full text-caption ">
                                <thead>
                                  <tr className="text-gray-400 uppercase ">
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
                                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700">
                                        {formatCurrency(item.amount, currency)}
                                        {item.quantity != null && item.unitRate != null && (
                                          <div className="text-caption text-gray-400">
                                            {item.quantity}{uomLabel(item.unit, item.unitOther) && ` ${uomLabel(item.unit, item.unitOther)}`} × {formatNumber(item.unitRate)}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-4 text-center">
                                        {item.isVatable ? (
                                          <span className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-caption font-medium">Tax</span>
                                        ) : "—"}
                                      </td>
                                      <td className="py-1.5 pr-4">
                                        <PayBadge status={item.paymentStatus as PayStatus} />
                                      </td>
                                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-600">
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
                                <p className="text-caption text-amber-700 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 inline-block">
                                  Taxable total: {formatCurrency(e.lineItems.filter((i: any) => i.isVatable).reduce((s: number, i: any) => s + i.amount, 0), currency)}
                                </p>
                              )}

                              {/* Discounts received — informational; never part of the total */}
                              {e.lineItems.some((i: any) => (i.discountAmount ?? 0) > 0) && (
                                <p className="text-caption text-income mt-2 ml-2 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5 inline-block">
                                  Discounts received: {formatCurrency(e.lineItems.reduce((s: number, i: any) => s + (i.discountAmount ?? 0), 0), currency)}
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

      {historyId && (
        <HistoryDrawer
          resource="ExpenseEntry"
          resourceId={historyId}
          title="Expense history"
          onClose={() => setHistoryId(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete expense?"
        message="This expense entry will be permanently deleted. Any petty-cash OUT entry linked to it is removed automatically (rows from older saves or bulk imports are unlinked and may need manual cleanup)."
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
      <ExportRangeDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        title="Export expenses"
        selectedMonth={month}
        onExport={handleRangeExport}
      />
      <ConfirmDialog
        open={deleteAllConfirm}
        onClose={() => setDeleteAllConfirm(false)}
        onConfirm={deleteAllExpenses}
        title={`Delete all expenses for ${selected?.name ?? "all properties"}?`}
        message={
          `This permanently deletes ${deleteAllCount === null ? "every" : deleteAllCount} expense${deleteAllCount === 1 ? "" : "s"} for ` +
          `${selected?.name ?? "every property you can access"} across ALL months — not just the one shown. This cannot be undone. ` +
          `Petty-cash OUT entries linked to these expenses are removed automatically; unlinked ones (from older saves or bulk imports) are NOT reversed and may need manual cleanup.`
        }
        typeToConfirm="DELETE"
        loading={deleteAllSubmitting}
      />
    </div>
  );
}
