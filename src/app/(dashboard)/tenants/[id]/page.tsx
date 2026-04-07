"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Spinner } from "@/components/ui/Spinner";
import { getLeaseStatus, formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency";
import { DocumentUpload } from "@/components/tenants/DocumentUpload";
import { DocumentList } from "@/components/tenants/DocumentList";
import { RenewalPipeline } from "@/components/tenants/RenewalPipeline";
import { EmailDraftModal } from "@/components/tenants/EmailDraftModal";
import { useProperty } from "@/lib/property-context";
import toast from "react-hot-toast";
import {
  ChevronLeft, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Download, FileText, Loader2, ScrollText, FolderOpen, RefreshCw, Mail,
  ShieldCheck, Plus, X, Banknote, Link2, Link2Off, Copy,
} from "lucide-react";
import { differenceInMonths, startOfMonth, addMonths, format } from "date-fns";

// ── Deposit Settlement Types ───────────────────────────────────────────────────

interface Deduction { reason: string; amount: string }

interface DepositSettlement {
  id:              string;
  tenantId:        string;
  depositHeld:     number;
  deductions:      { reason: string; amount: number }[];
  totalDeductions: number;
  netRefunded:     number;
  settledDate:     string;
  notes?:          string | null;
  createdAt:       string;
}

// ── Settle Deposit Modal ───────────────────────────────────────────────────────

function SettleDepositModal({
  tenantId,
  tenantName,
  depositAmount,
  currency,
  onSettled,
  onClose,
}: {
  tenantId:      string;
  tenantName:    string;
  depositAmount: number;
  currency:      string;
  onSettled:     (s: DepositSettlement) => void;
  onClose:       () => void;
}) {
  const [settledDate,  setSettledDate]  = useState(format(new Date(), "yyyy-MM-dd"));
  const [deductions,   setDeductions]   = useState<Deduction[]>([]);
  const [notes,        setNotes]        = useState("");
  const [submitting,   setSubmitting]   = useState(false);

  const totalDeductions = deductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const netRefunded     = depositAmount - totalDeductions;

  function addDeduction()          { setDeductions((p) => [...p, { reason: "", amount: "" }]); }
  function removeDeduction(i: number) { setDeductions((p) => p.filter((_, idx) => idx !== i)); }
  function updateDeduction(i: number, field: keyof Deduction, value: string) {
    setDeductions((p) => p.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanDeductions = deductions
      .filter((d) => d.reason.trim() && parseFloat(d.amount) > 0)
      .map((d) => ({ reason: d.reason.trim(), amount: parseFloat(d.amount) }));

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/settle-deposit`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositHeld:     depositAmount,
          deductions:      cleanDeductions,
          totalDeductions: cleanDeductions.reduce((s, d) => s + d.amount, 0),
          netRefunded,
          settledDate,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      const settlement: DepositSettlement = await res.json();
      toast.success("Deposit settlement recorded");
      onSettled(settlement);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to record settlement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg text-header">Settle Deposit</h2>
            <p className="text-xs text-gray-400 font-sans mt-0.5">{tenantName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Deposit held */}
          <div className="bg-cream-dark rounded-xl p-4 flex items-center justify-between">
            <p className="text-sm font-sans text-gray-500">Deposit held</p>
            <CurrencyDisplay amount={depositAmount} size="lg" className="text-header font-medium" />
          </div>

          {/* Settlement date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-1.5">Settlement Date</label>
            <input
              type="date"
              value={settledDate}
              onChange={(e) => setSettledDate(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans text-header focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>

          {/* Deductions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide font-sans">Deductions</label>
              <button type="button" onClick={addDeduction} className="flex items-center gap-1 text-xs text-gold hover:text-gold-dark font-sans font-medium transition-colors">
                <Plus size={12} /> Add deduction
              </button>
            </div>
            {deductions.length === 0 && (
              <p className="text-xs text-gray-400 font-sans italic py-2">No deductions — full deposit will be refunded</p>
            )}
            <div className="space-y-2">
              {deductions.map((d, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input
                    type="text"
                    placeholder="Reason (e.g. damage, cleaning)"
                    value={d.reason}
                    onChange={(e) => updateDeduction(i, "reason", e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    min="0"
                    step="100"
                    value={d.amount}
                    onChange={(e) => updateDeduction(i, "amount", e.target.value)}
                    className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                  <button type="button" onClick={() => removeDeduction(i)} className="p-2 text-gray-400 hover:text-expense transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-cream-dark rounded-xl p-4 space-y-2 text-sm font-sans">
            <div className="flex justify-between text-gray-500">
              <span>Deposit held</span>
              <span className="font-mono">{formatCurrency(depositAmount, currency)}</span>
            </div>
            {totalDeductions > 0 && (
              <div className="flex justify-between text-expense">
                <span>Total deductions</span>
                <span className="font-mono">− {formatCurrency(totalDeductions, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-header border-t border-gray-200 pt-2 mt-1">
              <span>Net refunded to tenant</span>
              <CurrencyDisplay amount={netRefunded} size="md" className={netRefunded >= 0 ? "text-income" : "text-expense"} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes about the settlement..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-sans text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-gold text-white rounded-xl text-sm font-sans font-medium hover:bg-gold-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Record Settlement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const INVOICE_STATUS_CONFIG = {
  DRAFT:     { label: "Draft",     cls: "bg-gray-100 text-gray-600" },
  SENT:      { label: "Sent",      cls: "bg-blue-100 text-blue-700" },
  PAID:      { label: "Paid",      cls: "bg-green-100 text-green-700" },
  OVERDUE:   { label: "Overdue",   cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-400" },
} as const;

interface Invoice {
  id: string; invoiceNumber: string; periodYear: number; periodMonth: number;
  totalAmount: number; rentAmount: number; serviceCharge: number; otherCharges: number;
  dueDate: string; status: keyof typeof INVOICE_STATUS_CONFIG;
  paidAt?: string | null; paidAmount?: number | null;
}

function buildLedger(tenant: any, incomeEntries: any[]) {
  if (!tenant?.leaseStart) return [];
  const leaseStart    = new Date(tenant.leaseStart);
  const leaseEnd      = tenant.leaseEnd ? new Date(tenant.leaseEnd) : new Date();
  const today         = new Date();
  const end           = leaseEnd < today ? leaseEnd : today;
  const totalMonths   = Math.max(differenceInMonths(startOfMonth(end), startOfMonth(leaseStart)) + 1, 1);
  const monthlyExpected = (tenant.monthlyRent ?? 0) + (tenant.serviceCharge ?? 0);

  const rows = [];
  for (let i = 0; i < totalMonths; i++) {
    const monthDate  = addMonths(startOfMonth(leaseStart), i);
    const monthStart = monthDate;
    const monthEnd   = addMonths(monthDate, 1);
    const payments   = incomeEntries.filter((e) => {
      const d = new Date(e.date);
      return d >= monthStart && d < monthEnd && e.type === "LONGTERM_RENT";
    });
    const received = payments.reduce((s: number, e: any) => s + e.grossAmount, 0);
    rows.push({ monthLabel: format(monthDate, "MMM yyyy"), monthDate, expected: monthlyExpected, received, variance: received - monthlyExpected, payments });
  }
  return rows.reverse();
}

type Tab = "ledger" | "invoices" | "documents" | "renewal" | "deposit";

export default function TenantDetailPage() {
  const { data: session } = useSession();
  const params  = useParams();
  const router  = useRouter();
  const { selected } = useProperty();
  const currency = selected?.currency ?? "USD";

  const [tenant,    setTenant]    = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [invoices,  setInvoices]  = useState<Invoice[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [tab,       setTab]       = useState<Tab>("ledger");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [renewalFeePrompt, setRenewalFeePrompt] = useState<{ unitId: string; tenantId: string; propertyId: string; amount: number } | null>(null);
  const [renewalFeeLogging, setRenewalFeeLogging] = useState(false);
  const [settlement, setSettlement] = useState<DepositSettlement | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [portalGenerating, setPortalGenerating] = useState(false);
  const [portalRevoking, setPortalRevoking] = useState(false);

  const tenantId = params.id as string;

  const fetchTenant = useCallback(() => {
    fetch(`/api/tenants/${tenantId}`)
      .then((r) => r.json())
      .then((d) => { setTenant(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tenantId]);

  const fetchDocuments = useCallback(() => {
    setDocsLoading(true);
    fetch(`/api/documents/${tenantId}`)
      .then((r) => r.json())
      .then((d) => setDocuments(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  }, [tenantId]);

  useEffect(() => { fetchTenant(); }, [fetchTenant]);

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/invoices?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((d) => setInvoices(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    if (tab === "documents") fetchDocuments();
  }, [tab, fetchDocuments]);

  useEffect(() => {
    if (tab !== "deposit") return;
    setSettlementLoading(true);
    fetch(`/api/tenants/${tenantId}/settle-deposit`)
      .then((r) => r.json())
      .then((d) => { setSettlement(d ?? null); setSettlementLoading(false); })
      .catch(() => setSettlementLoading(false));
  }, [tab, tenantId]);

  async function downloadPdf(inv: Invoice) {
    setDownloadingId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${inv.invoiceNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silently fail */ }
    finally { setDownloadingId(null); }
  }

  async function generatePortalLink() {
    setPortalGenerating(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/portal-token`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTenant((t: any) => ({ ...t, portalToken: data.portalToken, portalTokenExpiresAt: data.portalTokenExpiresAt }));
      toast.success("Portal link generated");
    } catch {
      toast.error("Failed to generate portal link");
    } finally {
      setPortalGenerating(false);
    }
  }

  async function revokePortalLink() {
    setPortalRevoking(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/portal-token`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTenant((t: any) => ({ ...t, portalToken: null, portalTokenExpiresAt: null }));
      toast.success("Portal link revoked");
    } catch {
      toast.error("Failed to revoke portal link");
    } finally {
      setPortalRevoking(false);
    }
  }

  const leaseStatus    = getLeaseStatus(tenant?.leaseEnd);
  const allIncomeEntries: any[] = tenant?.unit?.incomeEntries ?? [];
  const tenantEntries  = allIncomeEntries.filter((e) => !e.tenantId || e.tenantId === tenant?.id);
  const ledger         = tenant ? buildLedger(tenant, tenantEntries) : [];
  const totalExpected  = ledger.reduce((s, r) => s + r.expected, 0);
  const totalReceived  = ledger.reduce((s, r) => s + r.received, 0);
  const totalArrears   = totalReceived - totalExpected;
  const monthsInArrears = ledger.filter((r) => r.variance < 0).length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    { id: "ledger",    label: "Ledger",    icon: <TrendingUp size={14} /> },
    { id: "invoices",  label: "Invoices",  icon: <ScrollText size={14} />, badge: invoices.filter((i) => i.status !== "PAID" && i.status !== "CANCELLED").length || undefined },
    { id: "documents", label: "Documents", icon: <FolderOpen size={14} />, badge: documents.length || undefined },
    { id: "renewal",   label: "Renewal",   icon: <RefreshCw size={14} /> },
    { id: "deposit",   label: "Deposit",   icon: <Banknote size={14} /> },
  ];

  return (
    <div>
      <Header
        title={tenant?.name ?? "Tenant"}
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-white/70 hover:text-white text-sm font-sans transition-colors"
        >
          <ChevronLeft size={16} />Back
        </button>
      </Header>

      <div className="page-container space-y-5">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !tenant ? (
          <p className="text-gray-400 text-center py-12">Tenant not found</p>
        ) : (
          <>
            {/* ── Tenant Info Card ─────────────────────────────────────────── */}
            <Card>
              <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="font-display text-xl text-header">{tenant.name}</h2>
                  <p className="text-sm text-gray-400 font-mono mt-1">
                    {tenant.unit?.unitNumber} · {tenant.unit?.property?.name}
                  </p>
                  {tenant.unit?.property?.manager && (
                    <p className="text-xs text-gray-400 font-sans mt-0.5">
                      Manager: {tenant.unit.property.manager.name ?? tenant.unit.property.manager.email}
                    </p>
                  )}
                  {(tenant.email || tenant.phone) && (
                    <p className="text-xs text-gray-400 font-sans mt-1">
                      {[tenant.email, tenant.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {tenant.isActive ? (
                    leaseStatus === "TBC"      ? <Badge variant="gray">Lease TBC</Badge>
                    : leaseStatus === "CRITICAL" ? <Badge variant="red">Lease Expired</Badge>
                    : leaseStatus === "WARNING"  ? <Badge variant="amber">Expiring Soon</Badge>
                    : <Badge variant="green">Active</Badge>
                  ) : (
                    <Badge variant="gray">Vacated</Badge>
                  )}
                  {tenant.renewalStage && tenant.renewalStage !== "NONE" && (
                    <Badge variant={tenant.renewalStage === "RENEWED" ? "green" : "gold"}>
                      {tenant.renewalStage === "NOTICE_SENT"  ? "Notice Sent"
                      : tenant.renewalStage === "TERMS_AGREED" ? "Terms Agreed"
                      : "Renewed"}
                    </Badge>
                  )}
                  {/* Email button */}
                  <button
                    onClick={() => setShowEmail(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-gold hover:border-gold text-xs font-sans rounded-lg transition-colors"
                  >
                    <Mail size={13} /> Draft Email
                  </button>
                  {/* Portal link button */}
                  {!tenant.portalToken ? (
                    <button
                      onClick={generatePortalLink}
                      disabled={portalGenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 text-xs font-sans rounded-lg transition-colors disabled:opacity-50"
                    >
                      {portalGenerating ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                      Portal Link
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/portal/${tenant.portalToken}`);
                          toast.success("Link copied!");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-sans rounded-lg transition-colors"
                        title="Copy portal link"
                      >
                        <Copy size={13} /> Copy Link
                      </button>
                      <button
                        onClick={revokePortalLink}
                        disabled={portalRevoking}
                        className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 text-xs font-sans rounded-lg transition-colors disabled:opacity-50"
                        title="Revoke portal link"
                      >
                        {portalRevoking ? <Loader2 size={13} className="animate-spin" /> : <Link2Off size={13} />}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Monthly Rent",  value: tenant.monthlyRent },
                  { label: "Service Charge", value: tenant.serviceCharge },
                  { label: "Deposit Held",   value: tenant.depositAmount },
                  { label: "Total Monthly",  value: (tenant.monthlyRent ?? 0) + (tenant.serviceCharge ?? 0) },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">{item.label}</p>
                    <CurrencyDisplay amount={item.value} size="md" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-50">
                <div>
                  <p className="text-xs text-gray-400 font-sans">Lease Start</p>
                  <p className="text-sm font-sans text-header">{tenant.leaseStart ? formatDate(tenant.leaseStart) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-sans">Lease End</p>
                  <p className="text-sm font-sans text-header">{tenant.leaseEnd ? formatDate(tenant.leaseEnd) : "Open-ended"}</p>
                </div>
                {tenant.notes && (
                  <div>
                    <p className="text-xs text-gray-400 font-sans">Notes</p>
                    <p className="text-sm font-sans text-gray-600">{tenant.notes}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* ── Ledger Summary Cards ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Total Expected</p>
                <CurrencyDisplay amount={totalExpected} className="block mt-1 text-gray-600" size="lg" />
                <p className="text-xs text-gray-400 font-sans mt-1">{ledger.length} month{ledger.length !== 1 ? "s" : ""}</p>
              </Card>
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Total Received</p>
                <CurrencyDisplay amount={totalReceived} className="block mt-1 text-income" size="lg" />
                <p className="text-xs text-gray-400 font-sans mt-1">{tenantEntries.filter((e) => e.type === "LONGTERM_RENT").length} payment{tenantEntries.length !== 1 ? "s" : ""}</p>
              </Card>
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Balance</p>
                <CurrencyDisplay amount={totalArrears} className={`block mt-1 ${totalArrears >= 0 ? "text-income" : "text-expense"}`} size="lg" />
                <p className={`text-xs font-sans mt-1 ${totalArrears >= 0 ? "text-income" : "text-expense"}`}>
                  {totalArrears >= 0 ? "Overpaid / Advance" : "In arrears"}
                </p>
              </Card>
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Deposit</p>
                <CurrencyDisplay amount={tenant.depositAmount} className="block mt-1 text-gray-600" size="lg" />
                <p className="text-xs text-gray-400 font-sans mt-1">
                  {tenant.depositPaidDate ? `Paid ${formatDate(tenant.depositPaidDate)}` : "Date unknown"}
                </p>
              </Card>
            </div>

            {/* ── Tab Navigation ────────────────────────────────────────────── */}
            <Card padding="none">
              <div className="flex border-b border-gray-100 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium font-sans transition-colors border-b-2 -mb-px whitespace-nowrap ${
                      tab === t.id
                        ? "border-gold text-header"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {t.icon}
                    {t.label}
                    {t.badge !== undefined && Number(t.badge) > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono font-bold ${tab === t.id ? "bg-gold/20 text-gold-dark" : "bg-gray-100 text-gray-500"}`}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {/* ── LEDGER TAB ─────────────────────────────────────────────── */}
                {tab === "ledger" && (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="section-header">Payment Ledger</h2>
                      <div className="flex items-center gap-2 text-xs text-gray-400 font-sans">
                        <TrendingUp size={14} />
                        {monthsInArrears > 0 ? (
                          <span className="text-expense">{monthsInArrears} month{monthsInArrears > 1 ? "s" : ""} with shortfall</span>
                        ) : (
                          <span className="text-income">All payments up to date</span>
                        )}
                      </div>
                    </div>
                    {ledger.length === 0 ? (
                      <p className="text-gray-400 text-sm font-sans text-center py-6">No ledger data available</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px]">
                          <thead className="bg-cream-dark">
                            <tr>
                              {["Month", "Expected", "Received", "Variance", "Status", "Payments"].map((h) => (
                                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.map((row) => (
                              <tr key={row.monthLabel} className="border-t border-gray-50 hover:bg-cream/40 transition-colors">
                                <td className="px-4 py-3 text-sm font-sans font-medium text-header">{row.monthLabel}</td>
                                <td className="px-4 py-3 text-right"><CurrencyDisplay amount={row.expected} size="sm" className="text-gray-500" /></td>
                                <td className="px-4 py-3 text-right"><CurrencyDisplay amount={row.received} size="sm" colorize /></td>
                                <td className="px-4 py-3 text-right">
                                  <CurrencyDisplay amount={row.variance} size="sm" className={row.variance >= 0 ? "text-income" : "text-expense"} />
                                </td>
                                <td className="px-4 py-3">
                                  {row.received === 0 ? (
                                    <span className="flex items-center gap-1 text-xs text-expense font-sans"><AlertTriangle size={12} /> Unpaid</span>
                                  ) : row.variance >= 0 ? (
                                    <span className="flex items-center gap-1 text-xs text-income font-sans"><CheckCircle2 size={12} /> Paid</span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs text-amber-600 font-sans"><Clock size={12} /> Partial</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-400 font-sans">
                                  {row.payments.length === 0 ? "—" : row.payments.map((p: any) => (
                                    <span key={p.id} className="block">
                                      {formatDate(p.date)} · {formatCurrency(p.grossAmount, currency)}
                                      {p.note ? ` · ${p.note}` : ""}
                                    </span>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* ── INVOICES TAB ───────────────────────────────────────────── */}
                {tab === "invoices" && (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <h2 className="section-header">Invoices</h2>
                      {invoices.length > 0 && (
                        <span className="text-xs text-gray-400 font-sans ml-auto">
                          {invoices.filter((i) => i.status === "PAID").length} paid ·{" "}
                          {invoices.filter((i) => i.status !== "PAID" && i.status !== "CANCELLED").length} outstanding
                        </span>
                      )}
                    </div>
                    {invoices.length === 0 ? (
                      <div className="flex flex-col items-center py-8 gap-2 text-gray-400">
                        <FileText size={28} className="opacity-30" />
                        <p className="text-sm font-sans">No invoices yet</p>
                        <p className="text-xs font-sans">Generate invoices from the Invoices page</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[480px]">
                            <thead className="bg-cream-dark">
                              <tr>
                                {["Invoice #", "Period", "Amount", "Due Date", "Status", ""].map((h) => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {invoices.map((inv) => {
                                const cfg = INVOICE_STATUS_CONFIG[inv.status];
                                return (
                                  <tr key={inv.id} className="border-t border-gray-50 hover:bg-cream/40 transition-colors">
                                    <td className="px-4 py-3"><span className="font-mono text-xs font-medium text-header">{inv.invoiceNumber}</span></td>
                                    <td className="px-4 py-3 text-sm font-sans text-gray-600">{MONTH_NAMES[inv.periodMonth - 1]} {inv.periodYear}</td>
                                    <td className="px-4 py-3 text-right">
                                      <CurrencyDisplay amount={inv.totalAmount} size="sm" className="text-gray-700" />
                                      {inv.status === "PAID" && inv.paidAmount && inv.paidAmount !== inv.totalAmount && (
                                        <span className="block text-xs text-green-600 font-sans mt-0.5">Paid: {formatCurrency(inv.paidAmount, currency)}</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-sans text-gray-500">
                                      {format(new Date(inv.dueDate), "d MMM yyyy")}
                                      {inv.status === "PAID" && inv.paidAt && (
                                        <span className="block text-xs text-green-600 font-sans mt-0.5">Paid {format(new Date(inv.paidAt), "d MMM yyyy")}</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium font-sans ${cfg.cls}`}>{cfg.label}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <button
                                        onClick={() => downloadPdf(inv)}
                                        disabled={downloadingId === inv.id}
                                        title="Download PDF"
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors disabled:opacity-40"
                                      >
                                        {downloadingId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="border-t border-gray-100 pt-3 mt-1 flex flex-wrap gap-4 text-xs font-sans text-gray-500">
                          <span>Total billed: <strong className="text-gray-700 font-mono">{formatCurrency(invoices.reduce((s, i) => s + i.totalAmount, 0), currency)}</strong></span>
                          <span>Total paid: <strong className="text-green-700 font-mono">{formatCurrency(invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + (i.paidAmount ?? i.totalAmount), 0), currency)}</strong></span>
                          <span>Outstanding: <strong className="text-amber-700 font-mono">{formatCurrency(invoices.filter((i) => i.status !== "PAID" && i.status !== "CANCELLED").reduce((s, i) => s + i.totalAmount, 0), currency)}</strong></span>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* ── DOCUMENTS TAB ──────────────────────────────────────────── */}
                {tab === "documents" && (
                  <>
                    <h2 className="section-header mb-4">Documents</h2>
                    <div className="mb-5">
                      <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-3">Upload new document</p>
                      <DocumentUpload tenantId={tenantId} onUploaded={fetchDocuments} />
                    </div>
                    <div className="border-t border-gray-100 pt-4">
                      <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-3">
                        Uploaded files {documents.length > 0 && `(${documents.length})`}
                      </p>
                      {docsLoading ? (
                        <div className="flex justify-center py-6"><Spinner /></div>
                      ) : (
                        <DocumentList tenantId={tenantId} documents={documents} onDeleted={fetchDocuments} />
                      )}
                    </div>
                  </>
                )}

                {/* ── DEPOSIT TAB ────────────────────────────────────────────── */}
                {tab === "deposit" && (
                  <>
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="section-header">Deposit Management</h2>
                      {!settlement && !settlementLoading && tenant?.depositAmount > 0 && (
                        <Button size="sm" onClick={() => setShowSettleModal(true)}>
                          <ShieldCheck size={14} className="mr-1.5" /> Settle Deposit
                        </Button>
                      )}
                    </div>

                    {settlementLoading ? (
                      <div className="flex justify-center py-10"><Spinner /></div>
                    ) : !settlement ? (
                      /* ── No settlement yet ── */
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="bg-cream-dark rounded-xl p-4">
                            <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">Deposit Held</p>
                            <CurrencyDisplay amount={tenant?.depositAmount ?? 0} size="lg" className="text-header font-medium" />
                          </div>
                          <div className="bg-cream-dark rounded-xl p-4">
                            <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">Date Received</p>
                            <p className="text-sm font-sans text-header font-medium mt-1">
                              {tenant?.depositPaidDate ? formatDate(tenant.depositPaidDate) : "Not recorded"}
                            </p>
                          </div>
                          <div className="bg-cream-dark rounded-xl p-4">
                            <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">Status</p>
                            <div className="mt-1">
                              <Badge variant={tenant?.isActive ? "green" : "amber"}>
                                {tenant?.isActive ? "Held — tenant active" : "Pending settlement"}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {!tenant?.isActive && (
                          <div className="border border-amber-100 bg-amber-50/60 rounded-xl p-4 flex items-start gap-3">
                            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium font-sans text-amber-800">Tenant has vacated — deposit needs settlement</p>
                              <p className="text-xs text-amber-600 font-sans mt-0.5">Record deductions and the net amount refunded to close this out.</p>
                            </div>
                          </div>
                        )}

                        {tenant?.isActive && (
                          <p className="text-sm text-gray-400 font-sans text-center py-4">
                            Settlement is recorded when the tenant vacates and the deposit is returned (or partially withheld).
                          </p>
                        )}
                      </div>
                    ) : (
                      /* ── Settlement recorded ── */
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-income mb-1">
                          <CheckCircle2 size={16} />
                          <p className="text-sm font-medium font-sans">
                            Settled on {formatDate(settlement.settledDate)}
                          </p>
                        </div>

                        <div className="border border-gray-100 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <tbody>
                              <tr className="bg-cream-dark">
                                <td className="px-4 py-3 font-sans text-gray-500">Deposit held</td>
                                <td className="px-4 py-3 text-right font-mono text-header">{formatCurrency(settlement.depositHeld, currency)}</td>
                              </tr>
                              {(settlement.deductions as { reason: string; amount: number }[]).map((d, i) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="px-4 py-3 font-sans text-gray-500 pl-6">
                                    <span className="text-expense mr-1">−</span>{d.reason}
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono text-expense">{formatCurrency(d.amount, currency)}</td>
                                </tr>
                              ))}
                              {settlement.totalDeductions > 0 && (
                                <tr className="border-t border-gray-100 bg-cream-dark/50">
                                  <td className="px-4 py-3 font-sans text-gray-500">Total deductions</td>
                                  <td className="px-4 py-3 text-right font-mono text-expense">− {formatCurrency(settlement.totalDeductions, currency)}</td>
                                </tr>
                              )}
                              <tr className="border-t-2 border-gray-200 bg-cream-dark">
                                <td className="px-4 py-3 font-sans font-medium text-header">Net refunded to tenant</td>
                                <td className="px-4 py-3 text-right">
                                  <CurrencyDisplay amount={settlement.netRefunded} size="md" className={settlement.netRefunded >= 0 ? "text-income font-medium" : "text-expense font-medium"} />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {settlement.notes && (
                          <div className="bg-cream-dark rounded-xl p-4">
                            <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">Notes</p>
                            <p className="text-sm font-sans text-gray-600">{settlement.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── RENEWAL TAB ────────────────────────────────────────────── */}
                {tab === "renewal" && (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="section-header">Lease Renewal</h2>
                      <button
                        onClick={() => setShowEmail(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-gold hover:border-gold text-xs font-sans rounded-lg transition-colors"
                      >
                        <Mail size={13} /> Draft renewal email
                      </button>
                    </div>
                    <RenewalPipeline
                      tenantId={tenantId}
                      currentStage={tenant.renewalStage ?? "NONE"}
                      proposedRent={tenant.proposedRent ?? null}
                      proposedLeaseEnd={tenant.proposedLeaseEnd ?? null}
                      renewalNotes={tenant.renewalNotes ?? null}
                      currentRent={tenant.monthlyRent}
                      currentLeaseEnd={tenant.leaseEnd ?? null}
                      escalationRate={tenant.escalationRate ?? null}
                      currency={currency}
                      onUpdated={fetchTenant}
                      onRenewed={() => {
                        if (tenant?.unitId) {
                          setRenewalFeePrompt({
                            unitId:     tenant.unitId,
                            tenantId:   tenant.id,
                            propertyId: tenant.unit?.property?.id ?? "",
                            amount:     3000,
                          });
                        }
                      }}
                    />
                  </>
                )}
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Settle Deposit Modal */}
      {showSettleModal && tenant && (
        <SettleDepositModal
          tenantId={tenantId}
          tenantName={tenant.name}
          depositAmount={tenant.depositAmount}
          currency={currency}
          onSettled={(s) => { setSettlement(s); setShowSettleModal(false); }}
          onClose={() => setShowSettleModal(false)}
        />
      )}

      {/* Renewal Fee Prompt */}
      {renewalFeePrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                <Banknote size={18} className="text-gold" />
              </div>
              <div>
                <h3 className="font-display text-header text-base">Generate Renewal Fee Invoice?</h3>
                <p className="text-xs text-gray-400 font-sans mt-0.5">Lease marked as Renewed</p>
              </div>
            </div>
            <p className="text-sm font-sans text-gray-600">
              A lease renewal fee of <span className="font-semibold text-header">{formatCurrency(3000, currency)}</span> will be invoiced to the owner. Mark it paid once settled.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                disabled={renewalFeeLogging}
                onClick={async () => {
                  setRenewalFeeLogging(true);
                  try {
                    const now = new Date();
                    const due = new Date(now); due.setDate(due.getDate() + 7);
                    await fetch("/api/owner-invoices", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        propertyId:  renewalFeePrompt.propertyId,
                        type:        "RENEWAL_FEE",
                        periodYear:  now.getFullYear(),
                        periodMonth: now.getMonth() + 1,
                        lineItems: [{
                          description: `Lease renewal fee \u2014 ${tenant?.name}`,
                          amount:      renewalFeePrompt.amount,
                          unitId:      renewalFeePrompt.unitId,
                          tenantId:    renewalFeePrompt.tenantId,
                          incomeType:  "RENEWAL_FEE",
                        }],
                        dueDate: due.toISOString().split("T")[0],
                        notes: `Lease renewal: ${tenant?.name}`,
                      }),
                    });
                    import("react-hot-toast").then(({ default: toast }) =>
                      toast.success(`Renewal fee invoice of ${formatCurrency(3000, currency)} generated (DRAFT)`)
                    );
                  } catch {
                    import("react-hot-toast").then(({ default: toast }) =>
                      toast.error("Failed to generate renewal fee invoice")
                    );
                  } finally {
                    setRenewalFeeLogging(false);
                    setRenewalFeePrompt(null);
                  }
                }}
                className="px-4 py-2 bg-navy text-white text-sm font-sans rounded-lg hover:bg-navy/90 disabled:opacity-60"
              >
                {renewalFeeLogging ? "Generating…" : "Generate Invoice"}
              </button>
              <button
                onClick={() => setRenewalFeePrompt(null)}
                className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Draft Modal */}
      {showEmail && tenant && (
        <EmailDraftModal
          tenant={{
            name:            tenant.name,
            email:           tenant.email ?? null,
            monthlyRent:     tenant.monthlyRent,
            serviceCharge:   tenant.serviceCharge,
            leaseEnd:        tenant.leaseEnd ?? null,
            proposedRent:    tenant.proposedRent ?? null,
            proposedLeaseEnd: tenant.proposedLeaseEnd ?? null,
          }}
          currency={currency}
          onClose={() => setShowEmail(false)}
        />
      )}
    </div>
  );
}
