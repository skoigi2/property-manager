"use client";

import { useState, useEffect } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Select } from "@/components/ui/Select";
import {
  TrendingUp, TrendingDown, Building2, Receipt, Wallet,
  AlertTriangle, CheckCircle, Download, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { clsx } from "clsx";
import { format } from "date-fns";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatementLine {
  tenantName: string;
  unit: string;
  unitType: string;
  rentExpected: number;
  rentReceived: number;
  serviceCharge: number;
  otherIncome: number;
  grossTotal: number;
}

interface OwnerStatement {
  propertyId: string;
  propertyName: string;
  propertyType: string;
  period: string;
  lines: StatementLine[];
  grossIncome: number;
  managementFee: number;
  expenses: { category: string; description: string; amount: number }[];
  totalExpenses: number;
  netPayable: number;
  currency: string;
}

interface ArrearsCase {
  id: string;
  amountOwed: number;
  stage: string;
  createdAt: string;
  tenant: { name: string; unit: { unitNumber: string } };
  property: { name: string; currency?: string };
}

interface OwnerInvoice {
  id: string;
  invoiceNumber: string;
  type: string;
  periodYear: number;
  periodMonth: number | null;
  totalAmount: number;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  dueDate: string;
  paidAt?: string | null;
  property: { name: string };
  currency?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const currentYear  = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const YEARS = [currentYear, currentYear - 1].map((y) => ({ value: String(y), label: String(y) }));

const INVOICE_TYPE_LABELS: Record<string, string> = {
  LETTING_FEE: "Letting Fee", PERIODIC_LETTING_FEE: "Periodic Letting Fee",
  RENEWAL_FEE: "Renewal Fee", MANAGEMENT_FEE: "Management Fee",
  VACANCY_FEE: "Vacancy Fee", SETUP_FEE_INSTALMENT: "Setup Fee",
  CONSULTANCY_FEE: "Consultancy Fee",
};

const INVOICE_STATUS_CONFIG = {
  DRAFT:     { label: "Draft",     variant: "gray"  as const },
  SENT:      { label: "Sent",      variant: "blue"  as const },
  PAID:      { label: "Paid",      variant: "green" as const },
  OVERDUE:   { label: "Overdue",   variant: "red"   as const },
  CANCELLED: { label: "Cancelled", variant: "gray"  as const },
};

const CAT_LABELS: Record<string, string> = {
  SERVICE_CHARGE: "Service Charge", MANAGEMENT_FEE: "Management Fee",
  WIFI: "Wi-Fi", WATER: "Water", ELECTRICITY: "Electricity",
  CLEANER: "Cleaner", MAINTENANCE: "Maintenance", OTHER: "Other",
};

// ── Property Card ─────────────────────────────────────────────────────────────

function PropertyCard({ stmt }: { stmt: OwnerStatement }) {
  const [expanded, setExpanded] = useState(false);
  const fmt = (n: number) => formatCurrency(n, stmt.currency);
  const collectionRate = stmt.lines.reduce((s, l) => s + l.rentExpected, 0) > 0
    ? Math.round(
        (stmt.lines.reduce((s, l) => s + l.rentReceived, 0) /
          stmt.lines.reduce((s, l) => s + l.rentExpected, 0)) * 100
      )
    : null;

  return (
    <Card>
      {/* Property header */}
      <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-gold" />
          </div>
          <div>
            <h3 className="font-display text-base text-header">{stmt.propertyName}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="gray">{stmt.propertyType === "AIRBNB" ? "Short-let" : "Long-term"}</Badge>
              {collectionRate !== null && (
                <span className={clsx(
                  "text-xs font-sans font-medium",
                  collectionRate >= 90 ? "text-income" : collectionRate >= 70 ? "text-amber-600" : "text-expense",
                )}>
                  {collectionRate}% collected
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">Net Payable</p>
          <CurrencyDisplay
            currency={stmt.currency}
            amount={stmt.netPayable}
            size="xl"
            className={stmt.netPayable >= 0 ? "text-income font-semibold" : "text-expense font-semibold"}
          />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Gross Income",    value: stmt.grossIncome,    color: "text-income"  },
          { label: "Management Fee",  value: -stmt.managementFee, color: "text-expense" },
          { label: "Expenses",        value: -stmt.totalExpenses, color: "text-expense" },
          { label: "Net Payable",     value: stmt.netPayable,     color: stmt.netPayable >= 0 ? "text-income" : "text-expense" },
        ].map((k) => (
          <div key={k.label} className="bg-cream rounded-xl p-3">
            <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">{k.label}</p>
            <span className={clsx("font-mono text-sm font-semibold", k.color)}>
              {k.value < 0 ? "-" : ""}{fmt(Math.abs(k.value))}
            </span>
          </div>
        ))}
      </div>

      {/* Income lines toggle */}
      {stmt.lines.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gold font-medium font-sans mb-3"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? "Hide" : "Show"} {stmt.lines.length} unit{stmt.lines.length !== 1 ? "s" : ""}
          </button>

          {expanded && (
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-cream-dark">
                  <tr>
                    {["Unit/Tenant", "Expected", "Received", "Svc Charge", "Other", "Total"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stmt.lines.map((line, i) => {
                    const isPaid = line.rentExpected > 0 && line.rentReceived >= line.rentExpected * 0.99;
                    const isShort = line.rentExpected > 0 && line.rentReceived < line.rentExpected * 0.99;
                    return (
                      <tr key={i} className={clsx("border-t border-gray-50", isShort && "bg-red-50/40")}>
                        <td className="px-3 py-2.5">
                          <p className="font-sans text-sm text-header">{line.tenantName}</p>
                          <p className="font-mono text-xs text-gray-400">{line.unit}</p>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-sm text-gray-500">
                          {line.rentExpected > 0 ? fmt(line.rentExpected) : "—"}
                        </td>
                        <td className={clsx("px-3 py-2.5 font-mono text-sm font-medium", isPaid ? "text-income" : isShort ? "text-expense" : "text-gray-600")}>
                          {fmt(line.rentReceived)}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-sm text-gray-500">
                          {line.serviceCharge > 0 ? fmt(line.serviceCharge) : "—"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-sm text-gray-500">
                          {line.otherIncome > 0 ? fmt(line.otherIncome) : "—"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-sm font-semibold text-header">
                          {fmt(line.grossTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-cream">
                    <td className="px-3 py-2 text-xs font-medium font-sans text-gray-500 uppercase">Total</td>
                    <td className="px-3 py-2 font-mono text-sm text-gray-500">
                      {fmt(stmt.lines.reduce((s, l) => s + l.rentExpected, 0))}
                    </td>
                    <td className="px-3 py-2 font-mono text-sm text-income font-medium">
                      {fmt(stmt.lines.reduce((s, l) => s + l.rentReceived, 0))}
                    </td>
                    <td className="px-3 py-2 font-mono text-sm text-gray-500">
                      {fmt(stmt.lines.reduce((s, l) => s + l.serviceCharge, 0))}
                    </td>
                    <td className="px-3 py-2 font-mono text-sm text-gray-500">
                      {fmt(stmt.lines.reduce((s, l) => s + l.otherIncome, 0))}
                    </td>
                    <td className="px-3 py-2 font-mono text-sm font-bold text-income">
                      {fmt(stmt.grossIncome)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* Deductions summary (always visible) */}
      {(stmt.managementFee > 0 || stmt.totalExpenses > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
          {stmt.managementFee > 0 && (
            <div className="flex justify-between text-xs font-sans text-gray-500">
              <span>Management Fee</span>
              <span className="font-mono text-expense">({fmt(stmt.managementFee)})</span>
            </div>
          )}
          {stmt.expenses.map((e, i) => (
            <div key={i} className="flex justify-between text-xs font-sans text-gray-500">
              <span>{CAT_LABELS[e.category] ?? e.category}{e.description !== e.category ? ` — ${e.description}` : ""}</span>
              <span className="font-mono text-expense">({fmt(e.amount)})</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function OwnerDashboard() {
  const [year,  setYear]  = useState(String(currentYear));
  const [month, setMonth] = useState(String(currentMonth));

  const [statements, setStatements] = useState<OwnerStatement[]>([]);
  const [arrears,    setArrears]    = useState<ArrearsCase[]>([]);
  const [invoices,   setInvoices]   = useState<OwnerInvoice[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/report/owner-statement?year=${year}&month=${month}`).then((r) => r.json()),
      fetch("/api/arrears").then((r) => r.json()),
      fetch("/api/owner-invoices").then((r) => r.json()),
    ])
      .then(([stmts, arr, inv]) => {
        setStatements(Array.isArray(stmts) ? stmts : []);
        setArrears(Array.isArray(arr) ? arr.filter((c: ArrearsCase) => c.stage !== "RESOLVED") : []);
        setInvoices(Array.isArray(inv) ? inv.slice(0, 12) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year, month]);

  async function downloadInvoice(inv: OwnerInvoice) {
    setDownloadingId(inv.id);
    try {
      const res = await fetch(`/api/owner-invoices/${inv.id}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${inv.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download invoice");
    } finally {
      setDownloadingId(null);
    }
  }

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const totalGross      = statements.reduce((s, st) => s + st.grossIncome, 0);
  const totalNetPayable = statements.reduce((s, st) => s + st.netPayable, 0);
  const totalArrears    = arrears.reduce((s, c) => s + c.amountOwed, 0);
  const primaryCurrency = statements[0]?.currency ?? "USD";
  const fmt = (n: number, cur = primaryCurrency) => formatCurrency(n, cur);
  const periodLabel = `${MONTHS[Number(month) - 1]} ${year}`;

  return (
    <div className="space-y-6">
      {/* ── Period Picker ─────────────────────────────────────────────────── */}
      <Card padding="sm">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-sans font-medium text-gray-500 uppercase tracking-wide">Period</p>
          <div className="flex items-center gap-2">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
            <Select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={YEARS}
            />
          </div>
          <span className="text-xs text-gray-400 font-sans">{periodLabel}</span>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* ── Portfolio KPIs ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card padding="sm" className="border-l-4 border-income">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={15} className="text-income" />
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Gross Income</p>
              </div>
              <CurrencyDisplay currency={primaryCurrency} amount={totalGross} size="lg" className="text-income font-semibold" />
              <p className="text-xs text-gray-400 font-sans mt-1">{statements.length} propert{statements.length !== 1 ? "ies" : "y"}</p>
            </Card>
            <Card padding="sm" className={clsx("border-l-4", totalNetPayable >= 0 ? "border-income" : "border-expense")}>
              <div className="flex items-center gap-2 mb-1">
                <Wallet size={15} className={totalNetPayable >= 0 ? "text-income" : "text-expense"} />
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Net Payable</p>
              </div>
              <CurrencyDisplay
                currency={primaryCurrency}
                amount={totalNetPayable}
                size="lg"
                className={clsx("font-semibold", totalNetPayable >= 0 ? "text-income" : "text-expense")}
              />
              <p className="text-xs text-gray-400 font-sans mt-1">After fees & expenses</p>
            </Card>
            <Card padding="sm" className={clsx("border-l-4", arrears.length > 0 ? "border-expense" : "border-income")}>
              <div className="flex items-center gap-2 mb-1">
                {arrears.length > 0 ? (
                  <AlertTriangle size={15} className="text-expense" />
                ) : (
                  <CheckCircle size={15} className="text-income" />
                )}
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Rent Arrears</p>
              </div>
              {arrears.length > 0 ? (
                <>
                  <CurrencyDisplay currency={primaryCurrency} amount={totalArrears} size="lg" className="text-expense font-semibold" />
                  <p className="text-xs text-expense font-sans mt-1">{arrears.length} open case{arrears.length !== 1 ? "s" : ""}</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-display text-income mt-1">Clear</p>
                  <p className="text-xs text-income font-sans mt-1">No outstanding arrears</p>
                </>
              )}
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-2 mb-1">
                <Receipt size={15} className="text-gold" />
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Invoices</p>
              </div>
              <p className="text-2xl font-display text-header mt-1">{invoices.length}</p>
              <p className="text-xs text-gray-400 font-sans mt-1">
                {invoices.filter((i) => i.status === "PAID").length} paid ·{" "}
                {invoices.filter((i) => i.status === "OVERDUE").length} overdue
              </p>
            </Card>
          </div>

          {/* ── Per-Property Cards ────────────────────────────────────────── */}
          {statements.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center py-10 gap-2 text-center">
                <TrendingDown size={28} className="text-gray-300" />
                <p className="text-sm font-sans text-gray-500">No income data for {periodLabel}</p>
                <p className="text-xs font-sans text-gray-400">Try selecting a different month.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              <h2 className="text-sm font-sans font-semibold text-gray-500 uppercase tracking-wide">
                Property Performance — {periodLabel}
              </h2>
              {statements.map((stmt) => (
                <PropertyCard key={stmt.propertyId} stmt={stmt} />
              ))}
            </div>
          )}

          {/* ── Arrears ───────────────────────────────────────────────────── */}
          {arrears.length > 0 && (
            <div>
              <h2 className="text-sm font-sans font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Outstanding Rent Arrears
              </h2>
              <Card className="border border-red-100">
                <div className="flex items-center gap-2 mb-3 text-expense">
                  <AlertTriangle size={15} />
                  <p className="text-sm font-medium font-sans">{arrears.length} open arrears case{arrears.length !== 1 ? "s" : ""} — {fmt(totalArrears)} total outstanding</p>
                </div>
                <div className="space-y-2">
                  {arrears.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-sans text-header">{c.tenant.name}</p>
                        <p className="text-xs text-gray-400 font-sans">
                          Unit {c.tenant.unit.unitNumber} · {c.property.name} · Since {format(new Date(c.createdAt), "d MMM yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.stage === "EVICTION" ? "red" : c.stage === "LEGAL_NOTICE" ? "red" : c.stage === "DEMAND_LETTER" ? "gold" : "amber"}>
                          {c.stage.replace(/_/g, " ")}
                        </Badge>
                        <span className="font-mono text-sm font-semibold text-expense">
                          {fmt(c.amountOwed, c.property.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ── Owner Invoices ────────────────────────────────────────────── */}
          {invoices.length > 0 && (
            <div>
              <h2 className="text-sm font-sans font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Recent Owner Invoices
              </h2>
              <Card padding="none">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-cream-dark">
                      <tr>
                        {["Invoice #", "Type", "Property", "Period", "Amount", "Status", ""].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const cfg = INVOICE_STATUS_CONFIG[inv.status];
                        const cur = inv.currency ?? primaryCurrency;
                        return (
                          <tr key={inv.id} className="border-t border-gray-50 hover:bg-cream/40 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs font-medium text-header whitespace-nowrap">
                              {inv.invoiceNumber}
                            </td>
                            <td className="px-4 py-3 text-xs font-sans text-gray-600 whitespace-nowrap">
                              {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                            </td>
                            <td className="px-4 py-3 text-xs font-sans text-gray-600">
                              {inv.property.name}
                            </td>
                            <td className="px-4 py-3 text-xs font-sans text-gray-500 whitespace-nowrap">
                              {inv.periodMonth
                                ? `${MONTHS[inv.periodMonth - 1]} ${inv.periodYear}`
                                : String(inv.periodYear)}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm font-medium text-header whitespace-nowrap">
                              {formatCurrency(inv.totalAmount, cur)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => downloadInvoice(inv)}
                                disabled={downloadingId === inv.id}
                                title="Download PDF"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors disabled:opacity-40"
                              >
                                {downloadingId === inv.id
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : <Download size={14} />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
