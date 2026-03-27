"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Download, CheckCircle, Clock, AlertTriangle, XCircle,
  FileText, Loader2, Package, X, Pencil, ChevronDown, Zap,
  Home, RefreshCw, Building2,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { useProperty } from "@/lib/property-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OwnerInvoiceLineItem {
  description: string;
  amount: number;
  unitId?: string | null;
  tenantId?: string | null;
  incomeType: string;
}

interface OwnerInvoice {
  id: string;
  invoiceNumber: string;
  type: OwnerInvoiceType;
  periodYear: number;
  periodMonth: number;
  lineItems: OwnerInvoiceLineItem[];
  totalAmount: number;
  dueDate: string;
  status: InvoiceStatus;
  paidAt?: string | null;
  paidAmount?: number | null;
  notes?: string | null;
  createdAt: string;
  property: { name: string };
  owner?: { name?: string | null; email?: string | null } | null;
}

type OwnerInvoiceType =
  | "LETTING_FEE" | "PERIODIC_LETTING_FEE" | "RENEWAL_FEE"
  | "MANAGEMENT_FEE" | "VACANCY_FEE" | "SETUP_FEE_INSTALMENT" | "CONSULTANCY_FEE";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TYPE_CONFIG: Record<OwnerInvoiceType, { label: string; badge: string }> = {
  LETTING_FEE:          { label: "Letting Fee",        badge: "bg-amber-100 text-amber-800" },
  PERIODIC_LETTING_FEE: { label: "Airbnb Periodic",    badge: "bg-blue-100 text-blue-800"   },
  RENEWAL_FEE:          { label: "Renewal Fee",         badge: "bg-amber-100 text-amber-800" },
  MANAGEMENT_FEE:       { label: "Management Fee",      badge: "bg-gray-100 text-gray-700"   },
  VACANCY_FEE:          { label: "Vacancy Fee",         badge: "bg-orange-100 text-orange-800" },
  SETUP_FEE_INSTALMENT: { label: "Setup Fee",           badge: "bg-gray-100 text-gray-700"   },
  CONSULTANCY_FEE:      { label: "Consultancy Fee",     badge: "bg-gray-100 text-gray-700"   },
};

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; icon: React.ElementType; bg: string; text: string }> = {
  DRAFT:     { label: "Draft",     icon: FileText,      bg: "bg-gray-100",   text: "text-gray-600"  },
  SENT:      { label: "Sent",      icon: Clock,         bg: "bg-blue-100",   text: "text-blue-700"  },
  PAID:      { label: "Paid",      icon: CheckCircle,   bg: "bg-green-100",  text: "text-green-700" },
  OVERDUE:   { label: "Overdue",   icon: AlertTriangle, bg: "bg-red-100",    text: "text-red-700"   },
  CANCELLED: { label: "Cancelled", icon: XCircle,       bg: "bg-gray-100",   text: "text-gray-400"  },
};

const OWNER_INVOICE_TYPES: OwnerInvoiceType[] = [
  "LETTING_FEE","PERIODIC_LETTING_FEE","RENEWAL_FEE",
  "MANAGEMENT_FEE","VACANCY_FEE","SETUP_FEE_INSTALMENT","CONSULTANCY_FEE",
];

function formatKsh(n: number) {
  return `KSh ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ── Mark Paid Modal ───────────────────────────────────────────────────────────

function MarkPaidModal({
  invoice,
  onClose,
  onPaid,
}: {
  invoice: OwnerInvoice;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [paidAt,     setPaidAt]     = useState(format(new Date(), "yyyy-MM-dd"));
  const [paidAmount, setPaidAmount] = useState(String(invoice.totalAmount));
  const [saving,     setSaving]     = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/owner-invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID", paidAt, paidAmount: parseFloat(paidAmount) || invoice.totalAmount }),
      });
      if (!res.ok) throw new Error();
      toast.success("Invoice marked as paid");
      onPaid();
      onClose();
    } catch {
      toast.error("Failed to update invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-header text-base">Mark as Paid</h3>
            <p className="text-xs text-gray-400 font-sans mt-0.5">{invoice.invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-sans">Payment Date</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-sans">Amount Paid (KSh)</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-income text-white text-sm font-sans rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Confirm Payment
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bundle Airbnb Modal ───────────────────────────────────────────────────────

function BundleAirbnbModal({
  properties,
  onClose,
  onBundled,
}: {
  properties: { id: string; name: string; type: string }[];
  onClose: () => void;
  onBundled: () => void;
}) {
  const airbnbProps = properties.filter((p) => p.type === "AIRBNB");
  const now = new Date();
  const [propertyId, setPropertyId] = useState(airbnbProps[0]?.id ?? "");
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [dueDate,    setDueDate]    = useState(() => {
    const d = new Date(now); d.setDate(d.getDate() + 7);
    return format(d, "yyyy-MM-dd");
  });
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<{ bundled: number; totalAmount?: number } | null>(null);

  async function submit() {
    if (!propertyId) { toast.error("Select an Airbnb property"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/owner-invoices/bundle-airbnb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, year, month, dueDate }),
      });
      const data = await res.json();
      if (res.status === 409) { toast.error(data.error ?? "Bundle already exists"); return; }
      if (!res.ok) { toast.error(data.error ?? "Failed to bundle"); return; }
      setResult(data);
      if (data.bundled > 0) {
        toast.success(`Bundled ${data.bundled} bookings into owner invoice`);
        onBundled();
      } else {
        toast("No Airbnb income found for this period", { icon: "ℹ️" });
      }
    } catch {
      toast.error("Failed to create bundle invoice");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-header text-base">Bundle Airbnb Letting Fees</h3>
            <p className="text-xs text-gray-400 font-sans mt-0.5">Create a periodic owner invoice</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        {result && result.bundled > 0 ? (
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 space-y-1">
            <p className="text-sm font-sans font-medium text-income">Invoice created successfully</p>
            <p className="text-xs text-gray-600 font-sans">{result.bundled} booking{result.bundled !== 1 ? "s" : ""} bundled</p>
            {result.totalAmount != null && (
              <p className="text-xs text-gray-600 font-sans">Total: <span className="font-mono font-semibold">{formatKsh(result.totalAmount)}</span></p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-sans">Airbnb Property</label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              >
                {airbnbProps.length === 0 && <option value="">No Airbnb properties</option>}
                {airbnbProps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 font-sans">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                >
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-sans">Year</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-sans">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          {!result?.bundled ? (
            <button
              onClick={submit}
              disabled={loading || !propertyId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
              Create Bundle Invoice
            </button>
          ) : null}
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
            {result?.bundled ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Generate Draft Modal (shared for auto-generation types) ──────────────────

type GenerateType = "MANAGEMENT_FEE" | "LETTING_FEE" | "RENEWAL_FEE" | "VACANCY_FEE";

const GENERATE_CONFIG: Record<GenerateType, { label: string; endpoint: string; description: string }> = {
  MANAGEMENT_FEE: {
    label:       "Management Fee",
    endpoint:    "/api/owner-invoices/generate-mgmt-fee",
    description: "Auto-calculates from management fee config per unit",
  },
  LETTING_FEE: {
    label:       "Letting Fee",
    endpoint:    "/api/owner-invoices/generate-letting-fee",
    description: "New tenants who started a lease in the selected month",
  },
  RENEWAL_FEE: {
    label:       "Renewal Fee",
    endpoint:    "/api/owner-invoices/generate-renewal-fee",
    description: "Tenants with RENEWED stage and lease end in the selected month",
  },
  VACANCY_FEE: {
    label:       "Vacancy Fee",
    endpoint:    "/api/owner-invoices/generate-vacancy-fee",
    description: "Units vacant beyond the vacancy fee threshold",
  },
};

function GenerateModal({
  type,
  properties,
  defaultPropertyId,
  onClose,
  onGenerated,
}: {
  type: GenerateType;
  properties: { id: string; name: string }[];
  defaultPropertyId?: string;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const cfg = GENERATE_CONFIG[type];
  const now = new Date();
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? properties[0]?.id ?? "");
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [loading,    setLoading]    = useState(false);

  async function submit() {
    if (!propertyId) { toast.error("Select a property"); return; }
    setLoading(true);
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, periodYear: year, periodMonth: month }),
      });
      const data = await res.json();
      if (res.status === 409) { toast.error(data.error ?? "Invoice already exists for this period"); return; }
      if (!res.ok)            { toast.error(data.error ?? "Failed to generate invoice"); return; }
      toast.success(`${cfg.label} draft created — ${data.invoiceNumber}`);
      onGenerated();
      onClose();
    } catch {
      toast.error("Failed to generate invoice");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-header text-base">Generate {cfg.label}</h3>
            <p className="text-xs text-gray-400 font-sans mt-0.5">{cfg.description}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-sans">Property</label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
            >
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-sans">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              >
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-sans">Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={submit}
            disabled={loading || !propertyId}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Generate Draft
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Owner Invoice Modal ──────────────────────────────────────────────────

function EditOwnerInvoiceModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: OwnerInvoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const typeCfg = TYPE_CONFIG[invoice.type];

  const [dueDate, setDueDate] = useState(invoice.dueDate.slice(0, 10));
  const [notes,   setNotes]   = useState(invoice.notes ?? "");
  const [items,   setItems]   = useState(
    invoice.lineItems.map((li) => ({ description: li.description, amount: String(li.amount) }))
  );
  const [saving, setSaving] = useState(false);

  function addItem()       { setItems((p) => [...p, { description: "", amount: "" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: "description" | "amount", val: string) {
    setItems((p) => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  async function submit() {
    const lineItems = items
      .filter((i) => i.description && parseFloat(i.amount) > 0)
      .map((i) => ({
        description: i.description,
        amount:      parseFloat(i.amount),
        unitId:      null,
        tenantId:    null,
        incomeType:
          invoice.type === "LETTING_FEE" || invoice.type === "PERIODIC_LETTING_FEE" ? "LETTING_FEE"
          : invoice.type === "RENEWAL_FEE"          ? "RENEWAL_FEE"
          : invoice.type === "VACANCY_FEE"           ? "VACANCY_FEE"
          : invoice.type === "SETUP_FEE_INSTALMENT"  ? "SETUP_FEE_INSTALMENT"
          : invoice.type === "CONSULTANCY_FEE"       ? "CONSULTANCY_FEE"
          : "OTHER",
      }));

    if (lineItems.length === 0) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/owner-invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate, notes: notes || undefined, lineItems }),
      });
      if (!res.ok) throw new Error();
      toast.success("Invoice updated");
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to update invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 my-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-header text-lg">Edit Owner Invoice</h3>
            <p className="text-xs text-gray-400 font-sans mt-0.5">Changes are saved as a new draft</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        {/* Read-only identity strip */}
        <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-xs font-sans text-gray-500">
          <span className="font-mono font-semibold text-header">{invoice.invoiceNumber}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${typeCfg.badge}`}>
            {typeCfg.label}
          </span>
          <span>{invoice.property.name}</span>
          <span>{MONTH_NAMES[invoice.periodMonth - 1]} {invoice.periodYear}</span>
        </div>

        {/* Editable fields */}
        <div>
          <label className="text-xs text-gray-500 font-sans">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
        </div>

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500 font-sans uppercase tracking-wide font-medium">Line Items</label>
            <button onClick={addItem} className="text-xs text-gold font-sans hover:text-gold-dark flex items-center gap-1">
              <Plus size={12} /> Add row
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                <input
                  type="number"
                  placeholder="Amount"
                  value={item.amount}
                  onChange={(e) => updateItem(i, "amount", e.target.value)}
                  className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-expense"><X size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-2">
            <span className="text-xs text-gray-500 font-sans">Total: <span className="font-mono font-semibold text-header">{formatKsh(total)}</span></span>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 font-sans">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans resize-none focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
            Save Changes
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Owner Invoice Modal ───────────────────────────────────────────────────

function NewOwnerInvoiceModal({
  properties,
  onClose,
  onCreated,
}: {
  properties: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const now = new Date();
  const due = new Date(now); due.setDate(due.getDate() + 7);

  const [propertyId,  setPropertyId]  = useState(properties[0]?.id ?? "");
  const [type,        setType]        = useState<OwnerInvoiceType>("LETTING_FEE");
  const [periodYear,  setPeriodYear]  = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [dueDate,     setDueDate]     = useState(format(due, "yyyy-MM-dd"));
  const [notes,       setNotes]       = useState("");
  const [items, setItems] = useState([{ description: "", amount: "" }]);
  const [saving, setSaving] = useState(false);

  function addItem()       { setItems((p) => [...p, { description: "", amount: "" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: "description" | "amount", val: string) {
    setItems((p) => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  async function submit() {
    const lineItems = items
      .filter((i) => i.description && parseFloat(i.amount) > 0)
      .map((i) => ({
        description: i.description,
        amount:      parseFloat(i.amount),
        unitId:      null,
        tenantId:    null,
        incomeType:  type === "LETTING_FEE" || type === "PERIODIC_LETTING_FEE" ? "LETTING_FEE"
                   : type === "RENEWAL_FEE"       ? "RENEWAL_FEE"
                   : type === "VACANCY_FEE"        ? "VACANCY_FEE"
                   : type === "SETUP_FEE_INSTALMENT" ? "SETUP_FEE_INSTALMENT"
                   : type === "CONSULTANCY_FEE"    ? "CONSULTANCY_FEE"
                   : "OTHER",
      }));

    if (lineItems.length === 0) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/owner-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, type, periodYear, periodMonth, lineItems, dueDate, notes: notes || undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success("Owner invoice created (DRAFT)");
      onCreated();
      onClose();
    } catch {
      toast.error("Failed to create invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 my-8">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-header text-lg">New Owner Invoice</h3>
            <p className="text-xs text-gray-400 font-sans mt-0.5">Invoice from PKH to property owner</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 font-sans">Property</label>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40">
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 font-sans">Invoice Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as OwnerInvoiceType)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40">
              {OWNER_INVOICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-sans">Month</label>
            <select value={periodMonth} onChange={(e) => setPeriodMonth(Number(e.target.value))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40">
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-sans">Year</label>
            <input type="number" value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 font-sans">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40" />
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500 font-sans uppercase tracking-wide font-medium">Line Items</label>
            <button onClick={addItem} className="text-xs text-gold font-sans hover:text-gold-dark flex items-center gap-1">
              <Plus size={12} /> Add row
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                <input
                  type="number"
                  placeholder="Amount"
                  value={item.amount}
                  onChange={(e) => updateItem(i, "amount", e.target.value)}
                  className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-expense"><X size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-2">
            <span className="text-xs text-gray-500 font-sans">Total: <span className="font-mono font-semibold text-header">{formatKsh(total)}</span></span>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 font-sans">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans resize-none focus:outline-none focus:ring-2 focus:ring-gold/40" />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={submit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Invoice
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab Component ────────────────────────────────────────────────────────

export default function OwnerInvoicesTab() {
  const { selectedId } = useProperty();

  const [invoices,       setInvoices]       = useState<OwnerInvoice[]>([]);
  const [properties,     setProperties]     = useState<{ id: string; name: string; type: string }[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [showCreate,     setShowCreate]     = useState(false);
  const [showBundle,     setShowBundle]     = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<OwnerInvoice | null>(null);
  const [editTarget,     setEditTarget]     = useState<OwnerInvoice | null>(null);
  const [generateType,   setGenerateType]   = useState<GenerateType | null>(null);
  const [dropdownOpen,   setDropdownOpen]   = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter,   setTypeFilter]   = useState("ALL");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedId ? `?propertyId=${selectedId}` : "";
      const [invRes, propRes] = await Promise.all([
        fetch(`/api/owner-invoices${params}`),
        fetch("/api/properties"),
      ]);
      const invData  = await invRes.json();
      const propData = await propRes.json();
      setInvoices(Array.isArray(invData)  ? invData  : []);
      setProperties(Array.isArray(propData) ? propData : []);
    } catch {
      toast.error("Failed to load owner invoices");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch(`/api/owner-invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) { toast.error("Update failed"); return; }
    toast.success(`Status updated to ${status}`);
    fetchInvoices();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this invoice?")) return;
    const res = await fetch(`/api/owner-invoices/${id}`, { method: "DELETE" });
    if (res.status === 409) { toast.error("Cannot delete a paid invoice"); return; }
    if (!res.ok) { toast.error("Delete failed"); return; }
    toast.success("Invoice deleted");
    fetchInvoices();
  }

  function downloadPdf(id: string, invoiceNumber: string) {
    const a = document.createElement("a");
    a.href = `/api/owner-invoices/${id}/pdf`;
    a.download = `${invoiceNumber}.pdf`;
    a.click();
  }

  // Filtered list
  const filtered = invoices.filter((i) => {
    if (statusFilter !== "ALL" && i.status !== statusFilter) return false;
    if (typeFilter   !== "ALL" && i.type   !== typeFilter)   return false;
    return true;
  });

  const totalDue  = filtered.filter((i) => i.status !== "PAID" && i.status !== "CANCELLED").reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = filtered.filter((i) => i.status === "PAID").reduce((s, i) => s + (i.paidAmount ?? i.totalAmount), 0);

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {/* Generate Draft dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-sans text-gray-600 hover:bg-gray-50"
          >
            <Zap size={14} className="text-gold" />
            Generate Draft
            <ChevronDown size={13} className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl border border-gray-100 shadow-lg z-20 py-1 overflow-hidden">
              <button
                onClick={() => { setGenerateType("MANAGEMENT_FEE"); setDropdownOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-gray-700 hover:bg-gray-50 text-left"
              >
                <Zap size={14} className="text-gold shrink-0" />
                <div>
                  <div className="font-medium">Management Fee</div>
                  <div className="text-xs text-gray-400">Per unit fee config</div>
                </div>
              </button>
              <button
                onClick={() => { setGenerateType("LETTING_FEE"); setDropdownOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-gray-700 hover:bg-gray-50 text-left"
              >
                <Home size={14} className="text-amber-500 shrink-0" />
                <div>
                  <div className="font-medium">Letting Fee</div>
                  <div className="text-xs text-gray-400">New tenants this period</div>
                </div>
              </button>
              <button
                onClick={() => { setGenerateType("RENEWAL_FEE"); setDropdownOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-gray-700 hover:bg-gray-50 text-left"
              >
                <RefreshCw size={14} className="text-blue-500 shrink-0" />
                <div>
                  <div className="font-medium">Renewal Fee</div>
                  <div className="text-xs text-gray-400">Renewed leases this period</div>
                </div>
              </button>
              <button
                onClick={() => { setGenerateType("VACANCY_FEE"); setDropdownOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-gray-700 hover:bg-gray-50 text-left"
              >
                <Building2 size={14} className="text-gray-400 shrink-0" />
                <div>
                  <div className="font-medium">Vacancy Fee</div>
                  <div className="text-xs text-gray-400">Long-vacant units</div>
                </div>
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { setShowBundle(true); setDropdownOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-gray-700 hover:bg-gray-50 text-left"
              >
                <Package size={14} className="text-blue-400 shrink-0" />
                <div>
                  <div className="font-medium">Airbnb Periodic</div>
                  <div className="text-xs text-gray-400">Bundle short-let letting fees</div>
                </div>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-gold hover:bg-gold-dark text-white px-3 py-1.5 rounded-lg text-sm font-sans font-medium"
        >
          <Plus size={15} /> New Owner Invoice
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Invoices</p>
          <p className="text-2xl font-display text-header mt-1">{invoices.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Outstanding</p>
          <p className="text-xl font-display text-expense mt-1">{formatKsh(totalDue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Collected</p>
          <p className="text-xl font-display text-income mt-1">{formatKsh(totalPaid)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40">
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40">
          <option value="ALL">All Types</option>
          {OWNER_INVOICE_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 font-sans text-sm">
          No owner invoices found.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice #</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Property</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Period</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Due</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((invoice) => {
                  const typeCfg = TYPE_CONFIG[invoice.type];
                  const dueDate = new Date(invoice.dueDate);
                  const isOverdue = invoice.status !== "PAID" && invoice.status !== "CANCELLED" && dueDate < new Date();
                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-header">{invoice.invoiceNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeCfg.badge}`}>
                          {typeCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-sans">{invoice.property.name}</td>
                      <td className="px-4 py-3 text-gray-500 font-sans text-xs">
                        {MONTH_NAMES[invoice.periodMonth - 1]} {invoice.periodYear}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-header">
                        {formatKsh(invoice.totalAmount)}
                      </td>
                      <td className={`px-4 py-3 font-sans text-xs ${isOverdue ? "text-expense font-medium" : "text-gray-500"}`}>
                        {format(dueDate, "d MMM yyyy")}
                        {isOverdue && <span className="ml-1">⚠</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit */}
                          {(invoice.status === "DRAFT" || invoice.status === "SENT") && (
                            <button
                              onClick={() => setEditTarget(invoice)}
                              title="Edit invoice"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-amber-50"
                            >
                              <Pencil size={13} />
                            </button>
                          )}

                          {/* Download PDF */}
                          <button
                            onClick={() => downloadPdf(invoice.id, invoice.invoiceNumber)}
                            title="Download PDF"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-100"
                          >
                            <Download size={13} />
                          </button>

                          {/* Mark Sent */}
                          {invoice.status === "DRAFT" && (
                            <button
                              onClick={() => handleStatusChange(invoice.id, "SENT")}
                              title="Mark as Sent"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            >
                              <Clock size={13} />
                            </button>
                          )}

                          {/* Mark Paid */}
                          {(invoice.status === "DRAFT" || invoice.status === "SENT" || invoice.status === "OVERDUE") && (
                            <button
                              onClick={() => setMarkPaidTarget(invoice)}
                              title="Mark as Paid"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-income hover:bg-green-50"
                            >
                              <CheckCircle size={13} />
                            </button>
                          )}

                          {/* Delete */}
                          {invoice.status !== "PAID" && (
                            <button
                              onClick={() => handleDelete(invoice.id)}
                              title="Delete"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {markPaidTarget && (
        <MarkPaidModal
          invoice={markPaidTarget}
          onClose={() => setMarkPaidTarget(null)}
          onPaid={fetchInvoices}
        />
      )}
      {showBundle && (
        <BundleAirbnbModal
          properties={properties}
          onClose={() => setShowBundle(false)}
          onBundled={fetchInvoices}
        />
      )}
      {showCreate && (
        <NewOwnerInvoiceModal
          properties={properties}
          onClose={() => setShowCreate(false)}
          onCreated={fetchInvoices}
        />
      )}
      {editTarget && (
        <EditOwnerInvoiceModal
          invoice={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={fetchInvoices}
        />
      )}
      {generateType && (
        <GenerateModal
          type={generateType}
          properties={properties}
          defaultPropertyId={selectedId ?? undefined}
          onClose={() => setGenerateType(null)}
          onGenerated={fetchInvoices}
        />
      )}
    </>
  );
}
