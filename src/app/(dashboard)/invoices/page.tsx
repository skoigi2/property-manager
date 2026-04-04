"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Download,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Search,
  ChevronDown,
  X,
  Loader2,
  Receipt,
  User,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/currency";
import { Header } from "@/components/layout/Header";
import { useProperty } from "@/lib/property-context";
import OwnerInvoicesTab from "./OwnerInvoicesTab";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  unit: {
    unitNumber: string;
    property: { name: string };
  };
  serviceCharge?: number | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  rentAmount: number;
  serviceCharge: number;
  otherCharges: number;
  totalAmount: number;
  dueDate: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  paidAt?: string | null;
  paidAmount?: number | null;
  notes?: string | null;
  createdAt: string;
  _count?: { incomeEntries: number };
  tenant: {
    id: string;
    name: string;
    unit: {
      unitNumber: string;
      property: { name: string };
    };
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const STATUS_CONFIG = {
  DRAFT:     { label: "Draft",     icon: FileText,      bg: "bg-gray-100",   text: "text-gray-600" },
  SENT:      { label: "Sent",      icon: Clock,         bg: "bg-blue-100",   text: "text-blue-700" },
  PAID:      { label: "Paid",      icon: CheckCircle,   bg: "bg-green-100",  text: "text-green-700" },
  OVERDUE:   { label: "Overdue",   icon: AlertTriangle, bg: "bg-red-100",    text: "text-red-700" },
  CANCELLED: { label: "Cancelled", icon: XCircle,       bg: "bg-gray-100",   text: "text-gray-400" },
};

// ── Zod schemas ────────────────────────────────────────────────────────────────

const createSchema = z.object({
  tenantId:     z.string().min(1, "Select a tenant"),
  periodYear:   z.number().int().min(2020),
  periodMonth:  z.number().int().min(1).max(12),
  rentAmount:   z.number().min(0, "Required"),
  serviceCharge: z.number().min(0).default(0),
  otherCharges: z.number().min(0).default(0),
  dueDate:      z.string().min(1, "Required"),
  notes:        z.string().optional(),
});

const markPaidSchema = z.object({
  paidAt:    z.string().min(1, "Required"),
  paidAmount: z.number().optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type MarkPaidForm = z.infer<typeof markPaidSchema>;

// ── StatusBadge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Invoice["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

// ── CreateModal ────────────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);

  const now = new Date();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      periodYear:   now.getFullYear(),
      periodMonth:  now.getMonth() + 1,
      serviceCharge: 0,
      otherCharges: 0,
      dueDate: format(new Date(now.getFullYear(), now.getMonth(), 5), "yyyy-MM-dd"),
    },
  });

  const selectedTenantId = watch("tenantId");

  // Load active tenants
  useEffect(() => {
    fetch("/api/tenants?activeOnly=true")
      .then((r) => r.json())
      .then((data) => {
        setTenants(Array.isArray(data) ? data : []);
        setLoadingTenants(false);
      })
      .catch(() => setLoadingTenants(false));
  }, []);

  // Auto-fill rent when tenant selected
  useEffect(() => {
    if (!selectedTenantId) return;
    const t = tenants.find((x) => x.id === selectedTenantId);
    if (!t) return;
    // Fetch tenant detail to get rent
    fetch(`/api/tenants/${selectedTenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.rentAmount) setValue("rentAmount", data.rentAmount);
        if (data.serviceCharge) setValue("serviceCharge", data.serviceCharge);
      })
      .catch(() => {});
  }, [selectedTenantId, tenants, setValue]);

  async function onSubmit(data: CreateForm) {
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Failed to create invoice");
      return;
    }
    toast.success("Invoice created");
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-display text-lg text-header">New Invoice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {/* Tenant */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
              Tenant *
            </label>
            {loadingTenants ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                <Loader2 size={14} className="animate-spin" /> Loading tenants…
              </div>
            ) : (
              <select
                {...register("tenantId")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
              >
                <option value="">Select tenant…</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — Unit {t.unit.unitNumber} ({t.unit.property.name})
                  </option>
                ))}
              </select>
            )}
            {errors.tenantId && <p className="text-red-500 text-xs mt-1">{errors.tenantId.message}</p>}
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Month *</label>
              <select
                {...register("periodMonth", { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Year *</label>
              <select
                {...register("periodYear", { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Rent *</label>
              <input
                type="number"
                min={0}
                {...register("rentAmount", { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
                placeholder="0"
              />
              {errors.rentAmount && <p className="text-red-500 text-xs mt-1">{errors.rentAmount.message}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Svc Charge</label>
              <input
                type="number"
                min={0}
                {...register("serviceCharge", { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Other</label>
              <input
                type="number"
                min={0}
                {...register("otherCharges", { valueAsNumber: true })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
                placeholder="0"
              />
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Due Date *</label>
            <input
              type="date"
              {...register("dueDate")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
            {errors.dueDate && <p className="text-red-500 text-xs mt-1">{errors.dueDate.message}</p>}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
            <textarea
              {...register("notes")}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
              placeholder="Optional note for tenant…"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
              Create Invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── MarkPaidModal ──────────────────────────────────────────────────────────────

function MarkPaidModal({
  invoice,
  onClose,
  onUpdated,
}: {
  invoice: Invoice;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MarkPaidForm>({
    resolver: zodResolver(markPaidSchema),
    defaultValues: {
      paidAt: format(new Date(), "yyyy-MM-dd"),
      paidAmount: invoice.totalAmount,
    },
  });

  async function onSubmit(data: MarkPaidForm) {
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "PAID",
        paidAt: data.paidAt,
        paidAmount: data.paidAmount || invoice.totalAmount,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to mark as paid");
      return;
    }
    toast.success("Invoice marked as paid ✓");
    onUpdated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-display text-base text-header">Mark as Paid</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            <p className="font-medium">{invoice.invoiceNumber}</p>
            <p className="text-xs mt-0.5 text-green-600">
              {invoice.tenant.name} · {MONTH_NAMES[invoice.periodMonth - 1]} {invoice.periodYear}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Payment Date *</label>
            <input
              type="date"
              {...register("paidAt")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
            {errors.paidAt && <p className="text-red-500 text-xs mt-1">{errors.paidAt.message}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
              Amount Paid
            </label>
            <input
              type="number"
              min={0}
              {...register("paidAmount", { valueAsNumber: true })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
            <p className="text-xs text-gray-400 mt-1">Leave as total if fully paid</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Confirm Paid
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── InvoiceRow ─────────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice,
  currency,
  onMarkPaid,
  onDelete,
  onStatusChange,
  onSync,
}: {
  invoice: Invoice;
  currency: string;
  onMarkPaid: (inv: Invoice) => void;
  onDelete: (inv: Invoice) => void;
  onStatusChange: (id: string, status: string) => void;
  onSync: (id: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const needsSync = invoice.status === "PAID" && (invoice._count?.incomeEntries ?? 0) === 0;

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Sending status=PAID on an already-PAID invoice triggers idempotent income entry creation
        body: JSON.stringify({ status: "PAID" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Income entry created ✓");
      onSync(invoice.id);
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      {/* Invoice # + Period */}
      <td className="px-4 py-3">
        <p className="font-mono text-xs font-medium text-header">{invoice.invoiceNumber}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {MONTH_NAMES[invoice.periodMonth - 1]} {invoice.periodYear}
        </p>
      </td>

      {/* Tenant */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gold/10 rounded-full flex items-center justify-center shrink-0">
            <User size={12} className="text-gold" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">{invoice.tenant.name}</p>
            <p className="text-xs text-gray-400">
              Unit {invoice.tenant.unit.unitNumber} · {invoice.tenant.unit.property.name}
            </p>
          </div>
        </div>
      </td>

      {/* Amount */}
      <td className="px-4 py-3 text-right">
        <p className="text-sm font-medium font-mono text-gray-800">
          {formatCurrency(invoice.totalAmount, currency)}
        </p>
        {invoice.status === "PAID" && invoice.paidAmount && invoice.paidAmount !== invoice.totalAmount && (
          <p className="text-xs text-green-600 mt-0.5">Paid: {formatCurrency(invoice.paidAmount, currency)}</p>
        )}
      </td>

      {/* Due Date */}
      <td className="px-4 py-3 text-sm text-gray-500 text-center">
        {format(new Date(invoice.dueDate), "d MMM yyyy")}
      </td>

      {/* Status */}
      <td className="px-4 py-3 text-center">
        <StatusBadge status={invoice.status} />
        {invoice.status === "PAID" && invoice.paidAt && (
          <p className="text-xs text-gray-400 mt-0.5">
            {format(new Date(invoice.paidAt), "d MMM")}
          </p>
        )}
        {needsSync && (
          <p className="text-xs text-amber-600 mt-0.5 font-sans">⚠ No income entry</p>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {/* Download PDF */}
          <button
            onClick={downloadPdf}
            disabled={downloading}
            title="Download PDF"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors disabled:opacity-40"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          </button>

          {/* Sync income entry for already-paid invoices with no income entry */}
          {needsSync && (
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Create missing income entry"
              className="p-1.5 rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-40"
            >
              {syncing ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
            </button>
          )}

          {/* Mark paid */}
          {(invoice.status === "DRAFT" || invoice.status === "SENT" || invoice.status === "OVERDUE") && (
            <button
              onClick={() => onMarkPaid(invoice)}
              title="Mark as paid"
              className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
            >
              <CheckCircle size={15} />
            </button>
          )}

          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              title="Change status"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <ChevronDown size={15} />
            </button>
            {showActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                <div className="absolute right-0 top-8 z-20 bg-white border border-gray-100 rounded-xl shadow-lg w-36 py-1 text-sm">
                  {(["DRAFT","SENT","OVERDUE","CANCELLED"] as const).map((s) => (
                    <button
                      key={s}
                      disabled={invoice.status === s}
                      onClick={() => {
                        onStatusChange(invoice.id, s);
                        setShowActions(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button
                      onClick={() => {
                        onDelete(invoice);
                        setShowActions(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── BulkGenerateModal ──────────────────────────────────────────────────────────

function BulkGenerateModal({ onClose, onGenerated, propertyId }: { onClose: () => void; onGenerated: () => void; propertyId?: string | null }) {
  const now = new Date();
  const [year,  setYear]  = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{
    created: number; skipped: number; errors: number;
    createdNames: string[]; skippedNames: string[]; message: string;
  } | null>(null);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/invoices/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), month: Number(month), ...(propertyId ? { propertyId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate invoices");
        return;
      }
      setResult(data);
      if (data.created > 0) onGenerated();
    } catch {
      toast.error("Failed to generate invoices");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-gold" />
            <h2 className="font-display text-base text-header">Generate All Invoices</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-500 font-sans">
                Auto-generates invoices for all active long-term tenants for the selected month.
                Already-existing invoices are skipped.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Month</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Year</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
                  >
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 font-sans">
                Due date will be set to the 5th of the selected month. You can edit individual invoices after generation.
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {loading ? "Generating…" : `Generate for ${MONTH_NAMES[Number(month) - 1]} ${year}`}
                </button>
              </div>
            </>
          ) : (
            /* Result view */
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${result.created > 0 ? "bg-green-100" : "bg-gray-100"}`}>
                  {result.created > 0
                    ? <CheckCircle size={20} className="text-green-600" />
                    : <Receipt size={20} className="text-gray-400" />
                  }
                </div>
                <div>
                  <p className="font-medium text-header text-sm">{result.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-2xl font-display text-green-700">{result.created}</p>
                  <p className="text-xs text-green-600 font-sans">Created</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-2xl font-display text-gray-500">{result.skipped}</p>
                  <p className="text-xs text-gray-400 font-sans">Skipped</p>
                </div>
                <div className={`rounded-xl p-3 ${result.errors > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                  <p className={`text-2xl font-display ${result.errors > 0 ? "text-red-600" : "text-gray-300"}`}>{result.errors}</p>
                  <p className={`text-xs font-sans ${result.errors > 0 ? "text-red-500" : "text-gray-300"}`}>Errors</p>
                </div>
              </div>

              {result.createdNames.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Created for:</p>
                  <ul className="space-y-1">
                    {result.createdNames.map((n) => (
                      <li key={n} className="flex items-center gap-2 text-sm text-gray-600 font-sans">
                        <CheckCircle size={12} className="text-green-500 shrink-0" /> {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.skippedNames.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Already existed (skipped):</p>
                  <ul className="space-y-1">
                    {result.skippedNames.map((n) => (
                      <li key={n} className="text-xs text-gray-400 font-sans pl-5">— {n}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { data: session } = useSession();
  const { selectedId, selected } = useProperty();
  const currency = selected?.currency ?? "USD";
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"tenant" | "owner">(
    searchParams.get("tab") === "owner" ? "owner" : "tenant"
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkGenerate, setShowBulkGenerate] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [monthFilter, setMonthFilter] = useState<string>("ALL");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const propParam = selectedId ? `?propertyId=${selectedId}` : "";
      const res = await fetch(`/api/invoices${propParam}`);
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) { toast.error("Update failed"); return; }
    toast.success(`Status → ${status}`);
    fetchInvoices();
  }

  function handleSync(invoiceId: string) {
    // Refresh list so the ⚠ badge disappears and _count updates
    fetchInvoices();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/invoices/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      setDeleting(false);
      return;
    }
    toast.success("Invoice deleted");
    setDeleteTarget(null);
    setDeleting(false);
    fetchInvoices();
  }

  // Summary stats
  const stats = {
    total:   invoices.length,
    paid:    invoices.filter((i) => i.status === "PAID").length,
    overdue: invoices.filter((i) => i.status === "OVERDUE").length,
    pending: invoices.filter((i) => i.status === "SENT" || i.status === "DRAFT").length,
    paidAmt: invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + (i.paidAmount ?? i.totalAmount), 0),
    dueAmt:  invoices.filter((i) => i.status !== "PAID" && i.status !== "CANCELLED").reduce((s, i) => s + i.totalAmount, 0),
  };

  // Unique months in data
  const months = Array.from(
    new Set(invoices.map((i) => `${i.periodYear}-${String(i.periodMonth).padStart(2, "0")}`))
  ).sort().reverse();

  // Filtered list
  const filtered = invoices.filter((i) => {
    if (statusFilter !== "ALL" && i.status !== statusFilter) return false;
    if (monthFilter !== "ALL") {
      const key = `${i.periodYear}-${String(i.periodMonth).padStart(2, "0")}`;
      if (key !== monthFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (
        !i.invoiceNumber.toLowerCase().includes(q) &&
        !i.tenant.name.toLowerCase().includes(q) &&
        !i.tenant.unit.unitNumber.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  return (
    <>
      <Header title="Invoices" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkGenerate(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white px-3 py-1.5 rounded-lg text-sm font-sans transition-colors"
          >
            <Zap size={14} className="text-gold" />
            <span className="hidden sm:inline">Generate All</span>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-gold hover:bg-gold-dark text-white px-3 py-1.5 rounded-lg text-sm font-sans font-medium transition-colors shadow-sm"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New Invoice</span>
          </button>
        </div>
      </Header>
      <div className="page-container space-y-6">

      {/* Tab strip */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("tenant")}
          className={`px-4 py-2.5 text-sm font-medium font-sans border-b-2 transition-colors ${activeTab === "tenant" ? "border-gold text-gold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Tenant Invoices
        </button>
        <button
          onClick={() => setActiveTab("owner")}
          className={`px-4 py-2.5 text-sm font-medium font-sans border-b-2 transition-colors ${activeTab === "owner" ? "border-gold text-gold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Owner Invoices
        </button>
      </div>

      {activeTab === "owner" ? <OwnerInvoicesTab /> : (<>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total</p>
          <p className="text-2xl font-display text-header mt-1">{stats.total}</p>
          <p className="text-xs text-gray-400 mt-0.5">invoices</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Paid</p>
          <p className="text-2xl font-display text-green-700 mt-1">{stats.paid}</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(stats.paidAmt, currency)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Overdue</p>
          <p className="text-2xl font-display text-red-600 mt-1">{stats.overdue}</p>
          <p className="text-xs text-gray-400 mt-0.5">require attention</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Outstanding</p>
          <p className="text-2xl font-display text-gold mt-1">{stats.pending}</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(stats.dueAmt, currency)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, invoice # or unit…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 bg-white"
          >
            <option value="ALL">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 bg-white"
          >
            <option value="ALL">All periods</option>
            {months.map((m) => {
              const [y, mo] = m.split("-");
              return (
                <option key={m} value={m}>
                  {MONTH_NAMES[parseInt(mo) - 1]} {y}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" />
            Loading invoices…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Receipt size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No invoices found</p>
            <p className="text-xs mt-1">
              {invoices.length === 0
                ? "Create your first invoice to get started"
                : "Try adjusting your filters"}
            </p>
            {invoices.length === 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 flex items-center gap-1.5 bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
              >
                <Plus size={14} />
                New Invoice
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tenant</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Due</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    currency={currency}
                    onMarkPaid={setMarkPaidTarget}
                    onDelete={setDeleteTarget}
                    onStatusChange={handleStatusChange}
                    onSync={handleSync}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-gray-50 px-4 py-2.5 text-xs text-gray-400">
            Showing {filtered.length} of {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Modals */}
      {showBulkGenerate && (
        <BulkGenerateModal
          onClose={() => setShowBulkGenerate(false)}
          onGenerated={fetchInvoices}
          propertyId={selectedId}
        />
      )}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={fetchInvoices} />
      )}
      {markPaidTarget && (
        <MarkPaidModal
          invoice={markPaidTarget}
          onClose={() => setMarkPaidTarget(null)}
          onUpdated={fetchInvoices}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="font-display text-lg text-header mb-2">Delete Invoice?</h3>
            <p className="text-sm text-gray-600 mb-1">
              <span className="font-medium">{deleteTarget.invoiceNumber}</span> — {deleteTarget.tenant.name}
            </p>
            <p className="text-xs text-gray-400 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
      </div>
    </>
  );
}
