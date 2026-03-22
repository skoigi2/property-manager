"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Spinner } from "@/components/ui/Spinner";
import { getLeaseStatus, formatDate } from "@/lib/date-utils";
import {
  ChevronLeft, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Download, FileText, Loader2, ScrollText,
} from "lucide-react";
import { differenceInMonths, startOfMonth, addMonths, format } from "date-fns";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const INVOICE_STATUS_CONFIG = {
  DRAFT:     { label: "Draft",     cls: "bg-gray-100 text-gray-600" },
  SENT:      { label: "Sent",      cls: "bg-blue-100 text-blue-700" },
  PAID:      { label: "Paid",      cls: "bg-green-100 text-green-700" },
  OVERDUE:   { label: "Overdue",   cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-400" },
} as const;

interface Invoice {
  id: string;
  invoiceNumber: string;
  periodYear: number;
  periodMonth: number;
  totalAmount: number;
  rentAmount: number;
  serviceCharge: number;
  otherCharges: number;
  dueDate: string;
  status: keyof typeof INVOICE_STATUS_CONFIG;
  paidAt?: string | null;
  paidAmount?: number | null;
}

// Build a month-by-month ledger comparing what was expected vs what was received
function buildLedger(tenant: any, incomeEntries: any[]) {
  if (!tenant?.leaseStart) return [];

  const leaseStart = new Date(tenant.leaseStart);
  const leaseEnd = tenant.leaseEnd ? new Date(tenant.leaseEnd) : new Date();
  const today = new Date();
  const end = leaseEnd < today ? leaseEnd : today;

  const totalMonths = Math.max(differenceInMonths(startOfMonth(end), startOfMonth(leaseStart)) + 1, 1);
  const monthlyExpected = (tenant.monthlyRent ?? 0) + (tenant.serviceCharge ?? 0);

  const rows = [];
  for (let i = 0; i < totalMonths; i++) {
    const monthDate = addMonths(startOfMonth(leaseStart), i);
    const monthStart = monthDate;
    const monthEnd = addMonths(monthDate, 1);

    const payments = incomeEntries.filter((e) => {
      const d = new Date(e.date);
      return d >= monthStart && d < monthEnd && e.type === "LONGTERM_RENT";
    });

    const received = payments.reduce((s: number, e: any) => s + e.grossAmount, 0);
    const variance = received - monthlyExpected;

    rows.push({
      monthLabel: format(monthDate, "MMM yyyy"),
      monthDate,
      expected: monthlyExpected,
      received,
      variance,
      payments,
    });
  }

  return rows.reverse(); // newest first
}

export default function TenantDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tenants/${params.id}`)
      .then((r) => r.json())
      .then((d) => { setTenant(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params.id]);

  // Fetch invoices for this tenant separately
  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/invoices?tenantId=${params.id}`)
      .then((r) => r.json())
      .then((d) => setInvoices(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [params.id]);

  async function downloadPdf(inv: Invoice) {
    setDownloadingId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user will notice nothing happened
    } finally {
      setDownloadingId(null);
    }
  }

  const leaseStatus = getLeaseStatus(tenant?.leaseEnd);

  // Income entries: prefer tenantId-matched, fall back to all unit entries
  const allIncomeEntries: any[] = tenant?.unit?.incomeEntries ?? [];
  const tenantEntries = allIncomeEntries.filter(
    (e) => !e.tenantId || e.tenantId === tenant?.id
  );

  const ledger = tenant ? buildLedger(tenant, tenantEntries) : [];

  // Summary stats
  const totalExpected = ledger.reduce((s, r) => s + r.expected, 0);
  const totalReceived = ledger.reduce((s, r) => s + r.received, 0);
  const totalArrears = totalReceived - totalExpected;
  const monthsInArrears = ledger.filter((r) => r.variance < 0).length;

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
                  {(tenant.email || tenant.phone) && (
                    <p className="text-xs text-gray-400 font-sans mt-1">
                      {[tenant.email, tenant.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {tenant.isActive ? (
                    leaseStatus === "TBC" ? <Badge variant="gray">Lease TBC</Badge>
                    : leaseStatus === "CRITICAL" ? <Badge variant="red">Lease Expired</Badge>
                    : leaseStatus === "WARNING" ? <Badge variant="amber">Expiring Soon</Badge>
                    : <Badge variant="green">Active</Badge>
                  ) : (
                    <Badge variant="gray">Vacated</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Monthly Rent", value: tenant.monthlyRent },
                  { label: "Service Charge", value: tenant.serviceCharge },
                  { label: "Deposit Held", value: tenant.depositAmount },
                  { label: "Total Monthly", value: (tenant.monthlyRent ?? 0) + (tenant.serviceCharge ?? 0) },
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

            {/* ── Ledger Summary ────────────────────────────────────────────── */}
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
                <CurrencyDisplay
                  amount={totalArrears}
                  className={`block mt-1 ${totalArrears >= 0 ? "text-income" : "text-expense"}`}
                  size="lg"
                />
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

            {/* ── Month-by-month ledger ─────────────────────────────────────── */}
            <div className="flex items-center justify-between">
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
              <Card>
                <p className="text-gray-400 text-sm font-sans text-center py-6">No ledger data available</p>
              </Card>
            ) : (
              <Card padding="none">
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
                          <td className="px-4 py-3 text-right">
                            <CurrencyDisplay amount={row.expected} size="sm" className="text-gray-500" />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <CurrencyDisplay amount={row.received} size="sm" colorize />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <CurrencyDisplay
                              amount={row.variance}
                              size="sm"
                              className={row.variance >= 0 ? "text-income" : "text-expense"}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {row.received === 0 ? (
                              <span className="flex items-center gap-1 text-xs text-expense font-sans">
                                <AlertTriangle size={12} /> Unpaid
                              </span>
                            ) : row.variance >= 0 ? (
                              <span className="flex items-center gap-1 text-xs text-income font-sans">
                                <CheckCircle2 size={12} /> Paid
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-amber-600 font-sans">
                                <Clock size={12} /> Partial
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 font-sans">
                            {row.payments.length === 0 ? "—" : row.payments.map((p: any) => (
                              <span key={p.id} className="block">
                                {formatDate(p.date)} · KSh {p.grossAmount.toLocaleString("en-KE")}
                                {p.note ? ` · ${p.note}` : ""}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ── Invoices ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 mt-2">
              <ScrollText size={16} className="text-gray-400" />
              <h2 className="section-header">Invoices</h2>
              {invoices.length > 0 && (
                <span className="text-xs text-gray-400 font-sans ml-auto">
                  {invoices.filter((i) => i.status === "PAID").length} paid ·{" "}
                  {invoices.filter((i) => i.status !== "PAID" && i.status !== "CANCELLED").length} outstanding
                </span>
              )}
            </div>

            {invoices.length === 0 ? (
              <Card>
                <div className="flex flex-col items-center py-6 gap-2 text-gray-400">
                  <FileText size={28} className="opacity-30" />
                  <p className="text-sm font-sans">No invoices yet</p>
                  <p className="text-xs font-sans">Generate invoices from the Invoices page</p>
                </div>
              </Card>
            ) : (
              <Card padding="none">
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
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs font-medium text-header">{inv.invoiceNumber}</span>
                            </td>
                            <td className="px-4 py-3 text-sm font-sans text-gray-600">
                              {MONTH_NAMES[inv.periodMonth - 1]} {inv.periodYear}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <CurrencyDisplay amount={inv.totalAmount} size="sm" className="text-gray-700" />
                              {inv.status === "PAID" && inv.paidAmount && inv.paidAmount !== inv.totalAmount && (
                                <span className="block text-xs text-green-600 font-sans mt-0.5">
                                  Paid: KSh {inv.paidAmount.toLocaleString("en-KE")}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-sans text-gray-500">
                              {format(new Date(inv.dueDate), "d MMM yyyy")}
                              {inv.status === "PAID" && inv.paidAt && (
                                <span className="block text-xs text-green-600 font-sans mt-0.5">
                                  Paid {format(new Date(inv.paidAt), "d MMM yyyy")}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium font-sans ${cfg.cls}`}>
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => downloadPdf(inv)}
                                disabled={downloadingId === inv.id}
                                title="Download PDF"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors disabled:opacity-40"
                              >
                                {downloadingId === inv.id
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : <Download size={14} />
                                }
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Invoice totals footer */}
                <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap gap-4 text-xs font-sans text-gray-500">
                  <span>
                    Total billed:{" "}
                    <strong className="text-gray-700 font-mono">
                      KSh {invoices.reduce((s, i) => s + i.totalAmount, 0).toLocaleString("en-KE")}
                    </strong>
                  </span>
                  <span>
                    Total paid:{" "}
                    <strong className="text-green-700 font-mono">
                      KSh {invoices
                        .filter((i) => i.status === "PAID")
                        .reduce((s, i) => s + (i.paidAmount ?? i.totalAmount), 0)
                        .toLocaleString("en-KE")}
                    </strong>
                  </span>
                  <span>
                    Outstanding:{" "}
                    <strong className="text-amber-700 font-mono">
                      KSh {invoices
                        .filter((i) => i.status !== "PAID" && i.status !== "CANCELLED")
                        .reduce((s, i) => s + i.totalAmount, 0)
                        .toLocaleString("en-KE")}
                    </strong>
                  </span>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
