"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Loader2, Plus, Receipt, X, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { HelpTip } from "@/components/ui/HelpTip";

// Tenant invoice form — create and edit. An invoice is a set of LINES:
// rent, service charge, other charges, and the once-off move-in lines
// (refundable deposit, admin fee, lease agreement fee). The "Invoice type"
// control is only a preset that decides which lines start on the form; the
// manager can add or remove any line afterwards.

export type InvoiceKind = "RENT" | "MOVE_IN" | "DEPOSIT" | "CUSTOM";

type LineKey = "rentAmount" | "serviceCharge" | "otherCharges" | "depositAmount" | "adminFee" | "leaseFee";

const LINE_META: Record<LineKey, { label: string; hint: string; group: "rent" | "movein" }> = {
  rentAmount:    { label: "Rent",                       hint: "Rent for the billing period. Counted as rent income when paid.", group: "rent" },
  serviceCharge: { label: "Service charge",             hint: "Shared building costs passed to the tenant. Paid together with rent.", group: "rent" },
  otherCharges:  { label: "Other charges",              hint: "Any other amount billed with the rent (utilities, penalties).", group: "rent" },
  depositAmount: { label: "Refundable security deposit", hint: "Refundable at the end of the tenancy. When paid it is recorded as the deposit held for this tenant, never as rent income.", group: "movein" },
  adminFee:      { label: "Admin fee",                  hint: "Once-off fee at move-in. Landlord income.", group: "movein" },
  leaseFee:      { label: "Lease agreement fee",        hint: "Once-off fee for preparing the tenancy agreement. Landlord income.", group: "movein" },
};

const LINE_ORDER: LineKey[] = ["rentAmount", "serviceCharge", "otherCharges", "depositAmount", "adminFee", "leaseFee"];

const KIND_META: Record<InvoiceKind, { label: string; help: string }> = {
  RENT:    { label: "Monthly rent", help: "The regular rent invoice: rent plus service charge." },
  MOVE_IN: { label: "Move-in",      help: "Matches the tenancy agreement's move-in schedule: first month's rent + refundable deposit + once-off fees, on one invoice." },
  DEPOSIT: { label: "Deposit only", help: "Bills the refundable security deposit on its own. It can sit beside the month's rent invoice." },
  CUSTOM:  { label: "Custom",       help: "Start from rent and add whichever lines you need." },
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export interface InvoiceFormInvoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  rentAmount: number;
  serviceCharge: number;
  otherCharges: number;
  depositAmount?: number;
  adminFee?: number;
  leaseFee?: number;
  lateFeeAmount?: number;
  dueDate: string;
  notes?: string | null;
  tenant: { id: string; name: string; unit: { unitNumber: string; property: { name: string } } };
}

interface TenantOption {
  id: string;
  name: string;
  unit: { unitNumber: string; property: { name: string } };
}

interface TenantDetail {
  id: string;
  monthlyRent: number;
  serviceCharge: number;
  depositAmount: number;
  leaseStart: string;
  unit: { property: { id: string; currency: string | null } };
}

interface PropertyDefaults {
  adminFeeDefault: number | null;
  leaseFeeDefault: number | null;
}

type LineState = Partial<Record<LineKey, string>>;

function n(v: string | undefined): number {
  const x = parseFloat(v ?? "");
  return Number.isFinite(x) && x > 0 ? x : 0;
}

export default function InvoiceForm({
  invoice,
  initialTenantId,
  initialKind,
  currency: currencyProp,
  onClose,
  onSaved,
}: {
  /** Edit mode when set (DRAFT / SENT / OVERDUE only). */
  invoice?: InvoiceFormInvoice | null;
  initialTenantId?: string | null;
  initialKind?: InvoiceKind | null;
  currency?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!invoice;
  const now = new Date();

  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(!isEdit);
  const [tenantId, setTenantId] = useState(invoice?.tenantId ?? initialTenantId ?? "");
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [defaults, setDefaults] = useState<PropertyDefaults | null>(null);
  const [kind, setKind] = useState<InvoiceKind>(initialKind ?? (invoice && ((invoice.depositAmount ?? 0) > 0 || (invoice.adminFee ?? 0) > 0 || (invoice.leaseFee ?? 0) > 0) ? "CUSTOM" : "RENT"));
  const [periodYear, setPeriodYear] = useState(invoice?.periodYear ?? now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(invoice?.periodMonth ?? now.getMonth() + 1);
  const [dueDate, setDueDate] = useState(
    invoice ? format(new Date(invoice.dueDate), "yyyy-MM-dd") : format(new Date(now.getFullYear(), now.getMonth(), 5), "yyyy-MM-dd"),
  );
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<LineState>(() =>
    invoice
      ? Object.fromEntries(
          LINE_ORDER.filter((k) => (invoice[k] ?? 0) > 0 || k === "rentAmount").map((k) => [k, String(invoice[k] ?? 0)]),
        )
      : { rentAmount: "", serviceCharge: "" },
  );
  const [existingRentInvoice, setExistingRentInvoice] = useState<{ invoiceNumber: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const currency = detail?.unit?.property?.currency ?? currencyProp ?? "USD";
  const fmt = (v: number) => formatCurrency(v, currency);

  // Tenant list (create mode).
  useEffect(() => {
    if (isEdit) return;
    fetch("/api/tenants?activeOnly=true")
      .then((r) => r.json())
      .then((data) => setTenants(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingTenants(false));
  }, [isEdit]);

  // Tenant detail → rent / service charge / contractual deposit / lease start,
  // then the property's once-off fee defaults for the Move-in preset.
  useEffect(() => {
    if (!tenantId) { setDetail(null); setDefaults(null); return; }
    let cancelled = false;
    fetch(`/api/tenants/${tenantId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (t) => {
        if (cancelled || !t) return;
        setDetail(t);
        const propertyId = t.unit?.property?.id;
        if (propertyId) {
          const p = await fetch(`/api/properties/${propertyId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (!cancelled && p) setDefaults({ adminFeeDefault: p.adminFeeDefault ?? null, leaseFeeDefault: p.leaseFeeDefault ?? null });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tenantId]);

  // Apply the preset whenever the tenant detail / kind changes (create mode
  // only — editing keeps the stored lines).
  useEffect(() => {
    if (isEdit || !detail) return;
    const rent = String(detail.monthlyRent ?? "");
    const sc = detail.serviceCharge > 0 ? String(detail.serviceCharge) : "";
    const dep = detail.depositAmount > 0 ? String(detail.depositAmount) : "";
    const lease = defaults?.leaseFeeDefault ? String(defaults.leaseFeeDefault) : "";
    const admin = defaults?.adminFeeDefault ? String(defaults.adminFeeDefault) : "";
    if (kind === "RENT") setLines({ rentAmount: rent, ...(sc ? { serviceCharge: sc } : {}) });
    else if (kind === "MOVE_IN") {
      setLines({ rentAmount: rent, ...(sc ? { serviceCharge: sc } : {}), depositAmount: dep, leaseFee: lease, adminFee: admin });
      // The move-in invoice bills the lease-start month.
      const ls = detail.leaseStart ? new Date(detail.leaseStart) : null;
      if (ls && !Number.isNaN(ls.getTime())) {
        setPeriodYear(ls.getFullYear());
        setPeriodMonth(ls.getMonth() + 1);
        setDueDate(format(ls, "yyyy-MM-dd"));
      }
    } else if (kind === "DEPOSIT") setLines({ depositAmount: dep });
    else setLines((prev) => (Object.keys(prev).length ? prev : { rentAmount: rent, ...(sc ? { serviceCharge: sc } : {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, defaults, kind, isEdit]);

  // Duplicate-rent check: one rent invoice per tenant per month.
  useEffect(() => {
    if (!tenantId) { setExistingRentInvoice(null); return; }
    let cancelled = false;
    fetch(`/api/invoices?tenantId=${tenantId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; invoiceNumber: string; periodYear: number; periodMonth: number; rentAmount: number; status: string }[]) => {
        if (cancelled || !Array.isArray(list)) return;
        const hit = list.find(
          (i) => i.periodYear === periodYear && i.periodMonth === periodMonth && i.rentAmount > 0 && i.status !== "CANCELLED" && i.id !== invoice?.id,
        );
        setExistingRentInvoice(hit ? { invoiceNumber: hit.invoiceNumber } : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tenantId, periodYear, periodMonth, invoice?.id]);

  const activeLines = LINE_ORDER.filter((k) => k in lines);
  const availableLines = LINE_ORDER.filter((k) => !(k in lines));
  const total = useMemo(
    () => activeLines.reduce((s, k) => s + n(lines[k]), 0) + (invoice?.lateFeeAmount ?? 0),
    [activeLines, lines, invoice?.lateFeeAmount],
  );
  const rentConflict = existingRentInvoice && n(lines.rentAmount) > 0;

  function setLine(k: LineKey, v: string) {
    setLines((prev) => ({ ...prev, [k]: v }));
  }
  function removeLine(k: LineKey) {
    setLines((prev) => { const next = { ...prev }; delete next[k]; return next; });
  }
  function addLine(k: LineKey) {
    const preset =
      k === "depositAmount" && detail ? String(detail.depositAmount || "") :
      k === "serviceCharge" && detail ? String(detail.serviceCharge || "") :
      k === "rentAmount" && detail ? String(detail.monthlyRent || "") :
      k === "leaseFee" && defaults?.leaseFeeDefault ? String(defaults.leaseFeeDefault) :
      k === "adminFee" && defaults?.adminFeeDefault ? String(defaults.adminFeeDefault) : "";
    setLines((prev) => ({ ...prev, [k]: preset }));
    setAddOpen(false);
  }

  async function submit() {
    if (!tenantId) { toast.error("Select a tenant"); return; }
    if (total <= 0) { toast.error("Add at least one line with an amount"); return; }
    if (!dueDate) { toast.error("Set a due date"); return; }
    setSubmitting(true);
    try {
      const amounts = Object.fromEntries(LINE_ORDER.map((k) => [k, n(lines[k])]));
      const res = isEdit
        ? await fetch(`/api/invoices/${invoice!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...amounts, dueDate, notes }),
          })
        : await fetch("/api/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId, periodYear, periodMonth, ...amounts, dueDate, notes: notes || undefined, kind }),
          });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "Failed to save invoice");
        return;
      }
      toast.success(isEdit ? "Invoice updated" : `Invoice created — ${fmt(total)}`);
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/30";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-h3 text-header">{isEdit ? `Edit ${invoice!.invoiceNumber}` : "New Invoice"}</h2>
            {isEdit && (
              <p className="text-caption text-gray-400">{invoice!.tenant.name} · Unit {invoice!.tenant.unit.unitNumber}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Tenant */}
          {!isEdit && (
            <div>
              <label className="text-label font-medium text-gray-500 uppercase block mb-1">Tenant *</label>
              {loadingTenants ? (
                <div className="flex items-center gap-2 text-gray-400 text-body py-2">
                  <Loader2 size={14} className="animate-spin" /> Loading tenants…
                </div>
              ) : (
                <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={inputCls}>
                  <option value="">Select tenant…</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — Unit {t.unit.unitNumber} ({t.unit.property.name})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Invoice type */}
          {!isEdit && (
            <div>
              <label className="text-label font-medium text-gray-500 uppercase block mb-1">Invoice type</label>
              <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-lg p-1">
                {(Object.keys(KIND_META) as InvoiceKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`px-2 py-1.5 rounded-md text-caption font-medium transition-colors ${kind === k ? "bg-white text-header shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    {KIND_META[k].label}
                  </button>
                ))}
              </div>
              <p className="text-caption text-gray-400 mt-1.5">{KIND_META[kind].help}</p>
            </div>
          )}

          {/* Period + due date */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-label font-medium text-gray-500 uppercase block mb-1">Month *</label>
              <select value={periodMonth} disabled={isEdit} onChange={(e) => setPeriodMonth(Number(e.target.value))} className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label font-medium text-gray-500 uppercase block mb-1">Year *</label>
              <select value={periodYear} disabled={isEdit} onChange={(e) => setPeriodYear(Number(e.target.value))} className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}>
                {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label font-medium text-gray-500 uppercase block mb-1">Due date *</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-label font-medium text-gray-500 uppercase">Lines</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAddOpen((o) => !o)}
                  disabled={availableLines.length === 0}
                  className="flex items-center gap-1 text-caption font-medium text-gold hover:text-gold-dark disabled:opacity-40"
                >
                  <Plus size={12} /> Add line
                </button>
                {addOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
                    <div className="absolute right-0 top-6 z-20 bg-white border border-gray-100 rounded-xl shadow-lg w-60 py-1 text-body">
                      {availableLines.map((k) => (
                        <button key={k} type="button" onClick={() => addLine(k)} className="w-full text-left px-3 py-1.5 hover:bg-gray-50">
                          {LINE_META[k].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              {activeLines.length === 0 && (
                <p className="text-caption text-gray-400 px-3 py-3">No lines yet — use “Add line”.</p>
              )}
              {activeLines.map((k) => (
                <div key={k} className={`flex items-center gap-2 px-3 py-2 ${LINE_META[k].group === "movein" ? "bg-amber-50/40" : ""}`}>
                  <span className="flex items-center gap-1.5 flex-1 min-w-0 text-body text-gray-700">
                    <span className="truncate">{LINE_META[k].label}</span>
                    <HelpTip text={LINE_META[k].hint} />
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={lines[k] ?? ""}
                    onChange={(e) => setLine(k, e.target.value)}
                    placeholder="0"
                    className="w-32 border border-gray-200 rounded-lg px-2.5 py-1.5 text-body text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(k)}
                    title="Remove line"
                    className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {(invoice?.lateFeeAmount ?? 0) > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 text-caption text-amber-700">
                  <span className="flex-1">Late payment fee (managed separately)</span>
                  <span className="tabular-nums">{fmt(invoice!.lateFeeAmount!)}</span>
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-b-xl">
                <span className="text-body font-semibold text-header">Total</span>
                <span className="text-body font-semibold text-header tabular-nums">{fmt(total)}</span>
              </div>
            </div>
            {rentConflict && (
              <p className="text-caption text-amber-700 mt-1.5">
                A rent invoice ({existingRentInvoice!.invoiceNumber}) already exists for {MONTH_NAMES[periodMonth - 1]} {periodYear}.
                Remove the rent line to raise a deposit / fees-only invoice, or pick another month.
              </p>
            )}
            {n(lines.depositAmount) > 0 && detail && n(lines.depositAmount) !== detail.depositAmount && detail.depositAmount > 0 && (
              <p className="text-caption text-gray-400 mt-1.5">
                Contractual deposit on the tenant record: {fmt(detail.depositAmount)}.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-label font-medium text-gray-500 uppercase block mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Optional note for tenant…" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t shrink-0">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-body text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !!rentConflict}
            className="flex-1 px-4 py-2 bg-gold text-white rounded-lg text-body font-medium hover:bg-gold-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
            {isEdit ? "Save changes" : "Create Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
