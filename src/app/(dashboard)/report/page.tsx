"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Badge } from "@/components/ui/Badge";
import {
  FileText, Download, TrendingUp, Receipt, DollarSign,
  Wallet, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, FileDown, Building2, Calendar, Mail, BarChart2, Banknote,
} from "lucide-react";
import { OwnerEmailDraftModal } from "@/components/report/OwnerEmailDraftModal";
import { RecordRemittanceModal } from "@/components/report/RecordRemittanceModal";
import { TaxSummaryTab } from "@/components/report/TaxSummary";
import { OwnerDashboard } from "@/components/report/OwnerDashboard";
import { exportOwnerStatement, exportAnnualSummary, exportRentRoll } from "@/lib/excel-export";
import { clsx } from "clsx";
import type { ReportData } from "@/types/report";
import { useProperty } from "@/lib/property-context";
import { formatCurrency } from "@/lib/currency";
import { HelpTip } from "@/components/ui/HelpTip";

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CAT_LABELS: Record<string, string> = {
  SERVICE_CHARGE: "Service Charge",
  MANAGEMENT_FEE: "Management Fee",
  WIFI: "Wi-Fi",
  WATER: "Water",
  ELECTRICITY: "Electricity",
  CLEANER: "Cleaner",
  CONSUMABLES: "Consumables",
  MAINTENANCE: "Maintenance",
  REINSTATEMENT: "Reinstatement",
  CAPITAL: "Capital Item",
  OTHER: "Other",
};

const currentYear  = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const YEARS = [currentYear, currentYear - 1].map((y) => ({ value: String(y), label: String(y) }));

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthSummary {
  month: number;
  label: string;
  grossIncome: number;
  agentCommissions: number;
  totalExpenses: number;
  netProfit: number;
}

type Tab = "preview" | "annual" | "owner" | "download" | "quarterly" | "tax";

// ── Helpers ────────────────────────────────────────────────────────────────────

function Stat({ label, value, color, currency = "USD" }: { label: string; value: number; color: string; currency?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label text-gray-400 uppercase ">{label}</span>
      <CurrencyDisplay currency={currency} amount={value} className={`font-medium ${color}`} size="md" />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className=" text-h3 text-header mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
      {children}
    </h3>
  );
}

function AmountCell({ value, strikethrough = false, currency = "USD" }: { value: number; strikethrough?: boolean; currency?: string }) {
  return (
    <span className={clsx(
      "tabular-nums text-body",
      value < 0 ? "text-expense" : value > 0 ? "text-income" : "text-gray-400",
      strikethrough && "line-through text-gray-400",
    )}>
      {formatCurrency(Math.abs(value), currency)}
    </span>
  );
}

// ── P&L Preview Tab ────────────────────────────────────────────────────────────

function PLPreview({ year, month, selectedId }: { year: string; month: string; selectedId?: string | null }) {
  const { selected } = useProperty();
  const currency = useProperty().currency;
  const fmt = (n: number) => formatCurrency(n, currency);
  const [data, setData]       = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pcExpanded, setPcExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const qs = selectedId ? `&propertyId=${selectedId}` : "";
    fetch(`/api/report?year=${year}&month=${month}${qs}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year, month, selectedId]);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!data) return <p className="text-center text-gray-400 text-body py-16">Failed to load report data.</p>;

  const margin = data.kpis.grossIncome > 0
    ? ((data.kpis.netProfit / data.kpis.grossIncome) * 100).toFixed(1)
    : "0.0";

  const opExpenses  = data.expenses.filter((e) => !e.isSunkCost);
  const sunkExpenses = data.expenses.filter((e) => e.isSunkCost);

  async function downloadRentRoll() {
    try {
      const qs = selectedId ? `?propertyId=${selectedId}` : "";
      const res = await fetch(`/api/report/rent-roll${qs}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (!d.rows?.length) { toast.error("No units to export"); return; }
      exportRentRoll(d.rows, currency);
    } catch {
      toast.error("Rent roll export failed");
    }
  }

  return (
    <div className="space-y-5">
      {/* Meta */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className=" text-h3 text-header">{data.title}</p>
          <p className="text-caption text-gray-400 mt-0.5">Generated {data.generatedAt} · by {data.generatedBy}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadRentRoll}
            className="flex items-center gap-1.5 text-caption font-medium text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gold/50 hover:text-gold-dark transition-colors"
          >
            <FileDown size={13} /> Rent Roll (Excel)
          </button>
          {data.alerts.length > 0 && (
            <span className="flex items-center gap-1.5 text-caption font-medium text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-full">
              <AlertTriangle size={13} />
              {data.alerts.length} alert{data.alerts.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Gross Income",   tooltip: "Total rent and charges collected this period. Deposits are excluded.",                                           value: data.kpis.grossIncome,       icon: <TrendingUp size={16} />,  color: "text-income",  border: "border-income" },
          ...(data.kpis.incomeToDate != null ? [
          { label: "Income To Date", tooltip: "Cumulative income received across ALL time up to the end of this period (cash basis, deposits excluded).",       value: data.kpis.incomeToDate,      icon: <TrendingUp size={16} />,  color: "text-income",  border: "border-income" },
          ] : []),
          { label: "Commissions",    tooltip: "Agent or letting fees deducted from your revenue. This reduces your net income.",                                value: data.kpis.agentCommissions,  icon: <DollarSign size={16} />,  color: "text-expense", border: "border-expense" },
          { label: "Total Expenses", tooltip: "All operating costs — maintenance, utilities, management fees. One-off capital items are excluded.",             value: data.kpis.totalExpenses,     icon: <Receipt size={16} />,     color: "text-expense", border: "border-expense" },
          { label: "Net Profit",     tooltip: "Your actual return after all deductions. Compare month-on-month to track performance trends.",                   value: data.kpis.netProfit,         icon: <Wallet size={16} />,      color: data.kpis.netProfit >= 0 ? "text-income" : "text-expense", border: data.kpis.netProfit >= 0 ? "border-income" : "border-expense" },
        ].map((k) => (
          <Card key={k.label} padding="sm" className={`border-l-4 ${k.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={k.color}>{k.icon}</span>
              <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
                {k.label}
                <HelpTip text={k.tooltip} position="below" />
              </p>
            </div>
            <CurrencyDisplay currency={currency} amount={k.value} className={`${k.color} font-medium`} size="lg" />
          </Card>
        ))}
        <Card padding="sm" className={`border-l-4 ${data.kpis.occupancyRate >= 80 ? "border-income" : "border-amber-400"}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={data.kpis.occupancyRate >= 80 ? "text-income" : "text-amber-500"}><Building2 size={16} /></span>
            <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
              Occupancy
              <HelpTip text="Percentage of your units currently occupied. Above 80% is typically healthy for residential property." position="below" />
            </p>
          </div>
          <p className={`text-h1 tabular-nums ${data.kpis.occupancyRate >= 80 ? "text-income" : "text-amber-500"}`}>
            {data.kpis.occupancyRate}%
          </p>
        </Card>
        {data.kpis.collectionRate != null && (() => {
          const cr = data.kpis.collectionRate;
          const color  = cr >= 90 ? "text-income" : cr >= 70 ? "text-amber-500" : "text-expense";
          const border = cr >= 90 ? "border-income" : cr >= 70 ? "border-amber-400" : "border-expense";
          return (
            <Card padding="sm" className={`border-l-4 ${border}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={color}><Receipt size={16} /></span>
                <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
                  Collection Rate
                  <HelpTip text="Rent + service charges received as a share of what was expected this period. 90%+ is healthy; below 70% needs attention." position="below" />
                </p>
              </div>
              <p className={`text-h1 tabular-nums ${color}`}>{cr}%</p>
            </Card>
          );
        })()}
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card className="border border-amber-100 bg-amber-50/50">
          <SectionTitle><AlertTriangle size={16} className="text-amber-500" /> Alerts</SectionTitle>
          <ul className="space-y-1.5">
            {data.alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-body text-amber-700">
                <span className="shrink-0 mt-0.5">⚠</span>{a}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Riara One Rent Collection */}
      {data.rentCollection.length > 0 && (
        <Card>
          <SectionTitle><Receipt size={16} className="text-gold" /> {data.longTermPropertyName} — Rent Collection</SectionTitle>
          {/* Mobile: stacked tenant cards */}
          <div className="md:hidden space-y-2">
            {data.rentCollection.map((row) => {
              const total    = row.expectedRent + row.serviceCharge;
              const variance = row.received - total;
              const isPaid   = row.received >= total * 0.99;
              return (
                <div key={row.unit} className="rounded-xl border border-gray-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-body font-medium text-header">{row.tenantName}</p>
                      <p className="text-caption text-gray-400 tabular-nums mt-0.5">Unit {row.unit}</p>
                    </div>
                    <Badge variant={
                      row.status === "OK" ? "green" :
                      row.status === "WARNING" ? "amber" :
                      row.status === "CRITICAL" ? "red" : "gray"
                    }>
                      {row.leaseEnd ?? "TBC"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-50">
                    <div>
                      <p className="text-label text-gray-400 uppercase mb-0.5">Expected</p>
                      <p className="tabular-nums text-caption text-gray-600">{total.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-label text-gray-400 uppercase mb-0.5">Received</p>
                      <p className={clsx("tabular-nums text-caption font-medium", isPaid ? "text-income" : row.received > 0 ? "text-amber-600" : "text-expense")}>
                        {row.received.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-label text-gray-400 uppercase mb-0.5">Variance</p>
                      <p className={clsx("tabular-nums text-caption", variance >= 0 ? "text-income" : "text-expense")}>
                        {variance >= 0 ? "+" : ""}{variance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="rounded-xl border border-gold/25 bg-cream p-3 grid grid-cols-3 gap-2">
              <div>
                <p className="text-label text-gray-400 uppercase mb-0.5">Expected</p>
                <p className="tabular-nums text-caption font-medium text-header">
                  {data.rentCollection.reduce((s, r) => s + r.expectedRent + r.serviceCharge, 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-label text-gray-400 uppercase mb-0.5">Received</p>
                <p className="tabular-nums text-caption font-medium text-income">
                  {data.rentCollection.reduce((s, r) => s + r.received, 0).toLocaleString()}
                </p>
              </div>
              <div />
            </div>
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[560px] text-body">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Tenant", "Unit", "Expected", "Svc Charge", "Received", "Variance", "Lease"].map((h) => (
                    <th key={h} className="pb-2 text-left text-label font-medium text-gray-400 uppercase pr-4 last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rentCollection.map((row) => {
                  const total    = row.expectedRent + row.serviceCharge;
                  const variance = row.received - total;
                  const isPaid   = row.received >= total * 0.99;
                  return (
                    <tr key={row.unit} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4 text-header">{row.tenantName}</td>
                      <td className="py-2.5 pr-4 tabular-nums text-gray-500">{row.unit}</td>
                      <td className="py-2.5 pr-4 tabular-nums text-gray-600">
                        {row.expectedRent.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-gray-500">
                        {row.serviceCharge.toLocaleString()}
                      </td>
                      <td className={clsx("py-2.5 pr-4 tabular-nums font-medium", isPaid ? "text-income" : row.received > 0 ? "text-amber-600" : "text-expense")}>
                        {row.received.toLocaleString()}
                      </td>
                      <td className={clsx("py-2.5 pr-4 tabular-nums", variance >= 0 ? "text-income" : "text-expense")}>
                        {variance >= 0 ? "+" : ""}{variance.toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        <Badge variant={
                          row.status === "OK" ? "green" :
                          row.status === "WARNING" ? "amber" :
                          row.status === "CRITICAL" ? "red" : "gray"
                        }>
                          {row.leaseEnd ?? "TBC"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-cream">
                  <td colSpan={2} className="py-2 pr-4 text-label font-medium text-gray-500 uppercase">Total</td>
                  <td className="py-2 pr-4 tabular-nums text-body font-medium text-header">
                    {data.rentCollection.reduce((s, r) => s + r.expectedRent, 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-body text-gray-500">
                    {data.rentCollection.reduce((s, r) => s + r.serviceCharge, 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-body font-medium text-income">
                    {data.rentCollection.reduce((s, r) => s + r.received, 0).toLocaleString()}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Arrears Aging */}
      {data.arrearsAging && data.arrearsAging.totalCount > 0 && (
        <Card>
          <SectionTitle>
            <AlertTriangle size={16} className="text-gold" /> Arrears Aging
            <span className="text-caption text-gray-400 font-normal">
              as at {new Date(data.arrearsAging.asAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </SectionTitle>
          {data.arrearsAging.periodEndsBeforeAsAt && (
            <p className="text-caption text-gray-400 italic -mt-2 mb-3">
              Snapshot taken at report generation — reflects current arrears, not the period&apos;s.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {([
              ["current",  "Current"],
              ["d1_30",    "1–30 days"],
              ["d31_60",   "31–60 days"],
              ["d61_90",   "61–90 days"],
              ["d90plus",  "90+ days"],
            ] as const).map(([key, label]) => {
              const b = data.arrearsAging!.buckets[key];
              const danger = key === "d61_90" || key === "d90plus";
              return (
                <div key={key} className={clsx("rounded-xl border p-3", b.amount > 0 && danger ? "border-red-100 bg-red-50/50" : "border-gray-100")}>
                  <p className="text-label text-gray-400 uppercase ">{label}</p>
                  <p className={clsx("tabular-nums text-body font-medium mt-1", b.amount > 0 ? (danger ? "text-expense" : "text-header") : "text-gray-300")}>
                    {b.amount > 0 ? fmt(b.amount) : "—"}
                  </p>
                  {b.count > 0 && <p className="text-caption text-gray-400 mt-0.5">{b.count} invoice{b.count !== 1 ? "s" : ""}</p>}
                </div>
              );
            })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-body">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Tenant", "Unit", "Property", "Invoices", "Days Overdue", "Outstanding"].map((h) => (
                    <th key={h} className="pb-2 text-left text-label font-medium text-gray-400 uppercase pr-4 last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.arrearsAging.rows.map((r) => (
                  <tr key={`${r.tenantName}-${r.unitNumber}`} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 text-header">{r.tenantName}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-gray-500">{r.unitNumber}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{r.propertyName}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-gray-500">{r.invoiceCount}</td>
                    <td className={clsx("py-2.5 pr-4 tabular-nums", r.oldestAgeDays > 90 ? "text-expense font-medium" : r.oldestAgeDays > 30 ? "text-amber-600" : "text-gray-500")}>
                      {r.oldestAgeDays > 0 ? `${r.oldestAgeDays}d` : "—"}
                    </td>
                    <td className="py-2.5 tabular-nums font-medium text-expense">{fmt(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-cream">
                  <td colSpan={5} className="py-2 pr-4 text-label font-medium text-gray-500 uppercase">
                    Total outstanding · {data.arrearsAging.totalCount} tenant{data.arrearsAging.totalCount !== 1 ? "s" : ""}
                  </td>
                  <td className="py-2 tabular-nums text-body font-medium text-expense">{fmt(data.arrearsAging.totalOutstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Alba Gardens Performance */}
      {data.albaPerformance.length > 0 && (
        <Card>
          <SectionTitle><TrendingUp size={16} className="text-gold" /> {data.shortLetPropertyName} — Short-Let Performance</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[580px] text-body">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Unit", "Type", "Gross Revenue", "Commissions", "Fixed Costs", "Variable", "Net Revenue", "Occupancy"].map((h) => (
                    <th key={h} className="pb-2 text-left text-label font-medium text-gray-400 uppercase pr-4 last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.albaPerformance.map((row) => {
                  const occupancy = row.daysInMonth > 0
                    ? Math.round((row.bookedNights / row.daysInMonth) * 100)
                    : 0;
                  return (
                    <tr key={row.unitNumber} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4 tabular-nums font-medium text-header">{row.unitNumber}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="blue">{row.type.replace("_", " ")}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-income">
                        {row.grossRevenue.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-expense">
                        {row.commissions.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-gray-500">
                        {row.fixedCosts.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-gray-500">
                        {row.variableCosts.toLocaleString()}
                      </td>
                      <td className={clsx("py-2.5 pr-4 tabular-nums font-medium", row.netRevenue >= 0 ? "text-income" : "text-expense")}>
                        {row.netRevenue.toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        <span className={clsx("tabular-nums text-body font-medium",
                          occupancy >= 70 ? "text-income" : occupancy >= 40 ? "text-amber-600" : "text-expense"
                        )}>
                          {occupancy}%
                        </span>
                        <span className="text-caption text-gray-400 ml-1">({row.bookedNights}d)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-cream">
                  <td colSpan={2} className="py-2 pr-4 text-label font-medium text-gray-500 uppercase">Total</td>
                  <td className="py-2 pr-4 tabular-nums text-body text-income font-medium">
                    {data.albaPerformance.reduce((s, r) => s + r.grossRevenue, 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-body text-expense">
                    {data.albaPerformance.reduce((s, r) => s + r.commissions, 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-body text-gray-500">
                    {data.albaPerformance.reduce((s, r) => s + r.fixedCosts, 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-body text-gray-500">
                    {data.albaPerformance.reduce((s, r) => s + r.variableCosts, 0).toLocaleString()}
                  </td>
                  <td className="py-2 tabular-nums text-body font-medium text-income">
                    {data.albaPerformance.reduce((s, r) => s + r.netRevenue, 0).toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Expense Breakdown */}
      <Card>
        <SectionTitle><Receipt size={16} className="text-gold" /> Expense Breakdown</SectionTitle>
        <div className="space-y-2">
          {opExpenses.map((e) => (
            <div key={e.category} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-body text-gray-600">{CAT_LABELS[e.category] ?? e.category}</span>
              <AmountCell value={-e.amount} currency={currency} />
            </div>
          ))}
          {sunkExpenses.length > 0 && !data.capitalItems && (
            <>
              <p className="text-label text-gray-400 uppercase pt-2">Capital / Sunk Costs (excluded from P&L)</p>
              {sunkExpenses.map((e) => (
                <div key={e.category} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 opacity-60">
                  <span className="text-body text-gray-500">{CAT_LABELS[e.category] ?? e.category}</span>
                  <AmountCell value={-e.amount} strikethrough currency={currency} />
                </div>
              ))}
            </>
          )}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <span className="text-body font-medium text-header">Total Operating Expenses</span>
            <span className="tabular-nums text-body font-semibold text-expense">
              {fmt(opExpenses.reduce((s, e) => s + e.amount, 0))}
            </span>
          </div>
        </div>
      </Card>

      {/* Capital Items (excluded from P&L) */}
      {data.capitalItems && data.capitalItems.rows.length > 0 && (
        <Card>
          <SectionTitle>
            <Receipt size={16} className="text-gold" /> Capital Items
            <span className="text-caption text-gray-400 font-normal">excluded from P&L</span>
          </SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-body">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Date", "Description", "Category", "Amount"].map((h) => (
                    <th key={h} className="pb-2 text-left text-label font-medium text-gray-400 uppercase pr-4 last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.capitalItems.rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{r.date}</td>
                    <td className="py-2.5 pr-4 text-header">{r.description}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{CAT_LABELS[r.category] ?? r.category.replace(/_/g, " ")}</td>
                    <td className="py-2.5 tabular-nums text-gray-600">{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-cream">
                  <td colSpan={3} className="py-2 pr-4 text-label font-medium text-gray-500 uppercase">Total capital items (not deducted)</td>
                  <td className="py-2 tabular-nums text-body font-medium text-header">{fmt(data.capitalItems.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Vendor Spend */}
      {data.vendorSpend && data.vendorSpend.length > 0 && (
        <Card>
          <SectionTitle><Building2 size={16} className="text-gold" /> Vendor Spend</SectionTitle>
          <div className="space-y-1">
            {data.vendorSpend.map((v) => (
              <div key={v.vendorId} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <span className="text-body text-gray-700 font-medium">{v.name}</span>
                  <span className="ml-2 text-caption text-gray-400">{v.expenseCount} expense{v.expenseCount !== 1 ? "s" : ""}</span>
                </div>
                <span className="tabular-nums text-body font-medium text-expense shrink-0">{fmt(v.totalSpend)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* P&L Statement */}
      <Card>
        <SectionTitle><TrendingUp size={16} className="text-gold" /> Profit & Loss Statement</SectionTitle>
        <div className="space-y-2 max-w-sm">
          {[
            { label: "Gross Income",      tooltip: "Total rental revenue before any deductions.",                          value: data.kpis.grossIncome,                    bold: false, indent: false },
            { label: "Less: Commissions", tooltip: "Agent or letting fees deducted from gross income.",                    value: -data.kpis.agentCommissions,              bold: false, indent: true },
            { label: "Net Income",        tooltip: "Gross income minus agent commissions.",                                value: data.kpis.grossIncome - data.kpis.agentCommissions, bold: true, indent: false },
            { label: "Less: Expenses",    tooltip: "All operating costs deducted from net income.",                        value: -data.kpis.totalExpenses,                 bold: false, indent: true },
            { label: "Net Profit",        tooltip: "Your bottom line — income remaining after every deduction.",           value: data.kpis.netProfit,                      bold: true,  indent: false },
          ].map((row) => (
            <div key={row.label} className={clsx(
              "flex items-center justify-between py-1.5",
              row.bold ? "border-t border-gray-200 pt-3 mt-1" : "border-b border-gray-50",
            )}>
              <span className={clsx(" text-body flex items-center gap-1.5", row.bold ? "font-semibold text-header" : "text-gray-600", row.indent && "pl-4")}>
                {row.label}
                <HelpTip text={row.tooltip} />
              </span>
              <span className={clsx(
                "tabular-nums text-body",
                row.bold ? "font-semibold" : "font-medium",
                row.value >= 0 ? "text-income" : "text-expense",
              )}>
                {row.value < 0 ? "-" : ""}{fmt(Math.abs(row.value))}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="text-caption text-gray-400 flex items-center gap-1.5">
              Profit Margin
              <HelpTip text="Net Profit as a percentage of Gross Income — a higher margin means more efficient property management." />
            </span>
            <span className={clsx("tabular-nums text-body font-medium", Number(margin) >= 0 ? "text-income" : "text-expense")}>
              {margin}%
            </span>
          </div>
        </div>
      </Card>

      {/* Petty Cash */}
      <Card>
        <SectionTitle><Wallet size={16} className="text-gold" /> Petty Cash Reconciliation</SectionTitle>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: "Total In",  value: data.pettyCash.totalIn,  color: "text-income" },
            { label: "Total Out", value: data.pettyCash.totalOut, color: "text-expense" },
            { label: "Balance",   value: data.pettyCash.balance,  color: data.pettyCash.balance >= 0 ? "text-income" : "text-expense" },
          ].map((s) => (
            <div key={s.label} className="bg-cream rounded-lg p-3 text-center">
              <p className="text-label text-gray-400 uppercase mb-1">{s.label}</p>
              <CurrencyDisplay currency={currency} amount={s.value} className={`font-medium ${s.color}`} size="md" />
            </div>
          ))}
        </div>
        {data.pettyCash.entries.length > 0 && (
          <button
            onClick={() => setPcExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-caption text-gold font-medium"
          >
            {pcExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {pcExpanded ? "Hide" : "Show"} {data.pettyCash.entries.length} entries
          </button>
        )}
        {pcExpanded && (
          <div className="mt-3 overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-body">
              <thead className="bg-cream-dark">
                <tr>
                  {["Date", "Description", "In", "Out"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-label font-medium text-gray-400 uppercase ">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pettyCash.entries.map((e, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-500 ">{e.date}</td>
                    <td className="px-3 py-2 text-header ">{e.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-income">{e.type === "IN" ? fmt(e.amount) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-expense">{e.type === "OUT" ? fmt(e.amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Management Fee */}
      <Card>
        <SectionTitle><DollarSign size={16} className="text-gold" /> Management Fee Reconciliation</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Fees Owing", tooltip: "Management fees earned this period that haven't been paid yet.",              value: data.mgmtFee.owing,   color: "text-expense" },
            { label: "Fees Paid",  tooltip: "Management fees already invoiced and received.",                              value: data.mgmtFee.paid,    color: "text-income" },
            { label: "Balance",    tooltip: "Positive = fees still outstanding. Negative = you've been overpaid and may need to adjust next invoice.", value: data.mgmtFee.balance, color: data.mgmtFee.balance >= 0 ? "text-income" : "text-expense" },
          ].map((s) => (
            <div key={s.label} className="bg-cream rounded-lg p-3 text-center">
              <p className="text-label text-gray-400 uppercase mb-1 flex items-center justify-center gap-1.5">
                {s.label}
                <HelpTip text={s.tooltip} />
              </p>
              <CurrencyDisplay currency={currency} amount={s.value} className={`font-medium ${s.color}`} size="md" />
            </div>
          ))}
        </div>
        {data.mgmtFee.balance >= 0 ? (
          <div className="flex items-center gap-2 mt-3 text-income text-body ">
            <CheckCircle size={14} /> Management fee fully settled
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-3 text-expense text-body ">
            <AlertTriangle size={14} /> Outstanding: {fmt(Math.abs(data.mgmtFee.balance))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Annual Summary Tab ─────────────────────────────────────────────────────────

function AnnualSummary({ year, selectedId }: { year: string; selectedId?: string | null }) {
  const { selected } = useProperty();
  const currency = useProperty().currency;
  const fmt = (n: number) => formatCurrency(n, currency);
  const [months, setMonths]   = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoading(true);
    const qs = selectedId ? `&propertyId=${selectedId}` : "";
    fetch(`/api/report?year=${year}${qs}`)
      .then((r) => r.json())
      .then((d) => { setMonths(d.months ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year, selectedId]);

  async function handleDownloadPDF() {
    setGenerating(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "annual", year, ...(selectedId ? { propertyId: selectedId } : {}) }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `property-report-${year}-annual.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Annual report downloaded!");
    } catch {
      toast.error("Failed to generate annual report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const totals = months.reduce(
    (acc, m) => ({
      grossIncome:      acc.grossIncome      + m.grossIncome,
      agentCommissions: acc.agentCommissions + m.agentCommissions,
      totalExpenses:    acc.totalExpenses    + m.totalExpenses,
      netProfit:        acc.netProfit        + m.netProfit,
    }),
    { grossIncome: 0, agentCommissions: 0, totalExpenses: 0, netProfit: 0 },
  );

  const bestMonth = months.reduce((best, m) => m.netProfit > best.netProfit ? m : best, months[0]);

  return (
    <div className="space-y-5">
      {/* Export buttons */}
      {months.length > 0 && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => exportAnnualSummary(months, year)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
          >
            <FileDown size={13} /> Export to Excel
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-gold/50 hover:text-gold-dark hover:bg-gold/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={13} /> {generating ? "Generating…" : "Download PDF"}
          </button>
        </div>
      )}

      {/* Year KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Annual Gross",    value: totals.grossIncome,       color: "text-income",  border: "border-income" },
          { label: "Commissions",     value: totals.agentCommissions,  color: "text-expense", border: "border-expense" },
          { label: "Total Expenses",  value: totals.totalExpenses,     color: "text-expense", border: "border-expense" },
          { label: "Annual Net",      value: totals.netProfit,         color: totals.netProfit >= 0 ? "text-income" : "text-expense", border: totals.netProfit >= 0 ? "border-income" : "border-expense" },
        ].map((k) => (
          <Card key={k.label} padding="sm" className={`border-l-4 ${k.border}`}>
            <p className="text-label text-gray-400 uppercase mb-1">{k.label}</p>
            <CurrencyDisplay currency={currency} amount={k.value} className={`${k.color} font-medium`} size="lg" />
          </Card>
        ))}
      </div>

      {bestMonth && (
        <div className="flex items-center gap-2 text-body text-gray-500 bg-cream rounded-xl px-4 py-2.5">
          <TrendingUp size={14} className="text-gold" />
          Best month: <span className="font-medium text-header">{bestMonth.label} {year}</span>
          &nbsp;· {fmt(bestMonth.netProfit)} net profit
        </div>
      )}

      {/* Monthly Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-body">
            <thead className="bg-cream-dark">
              <tr>
                {["Month", "Gross Income", "Commissions", "Expenses", "Net Profit", "Margin"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-label font-medium text-gray-400 uppercase ">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const netIncome = m.grossIncome - m.agentCommissions;
                const margin    = m.grossIncome > 0 ? ((m.netProfit / m.grossIncome) * 100).toFixed(1) : "—";
                const isEmpty   = m.grossIncome === 0 && m.totalExpenses === 0;
                return (
                  <tr key={m.month} className={clsx(
                    "border-t border-gray-50 transition-colors",
                    isEmpty ? "opacity-40" : "hover:bg-cream/50",
                    m.month === currentMonth && Number(year) === currentYear && "bg-gold/5",
                  )}>
                    <td className="px-4 py-3 font-medium text-header">
                      {m.label}
                      {m.month === currentMonth && Number(year) === currentYear && (
                        <span className="ml-2 text-caption text-gold ">(current)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-income">
                      {m.grossIncome > 0 ? fmt(m.grossIncome) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-expense">
                      {m.agentCommissions > 0 ? fmt(m.agentCommissions) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-expense">
                      {m.totalExpenses > 0 ? fmt(m.totalExpenses) : "—"}
                    </td>
                    <td className={clsx("px-4 py-3 tabular-nums font-medium", m.netProfit >= 0 ? "text-income" : "text-expense")}>
                      {isEmpty ? "—" : fmt(m.netProfit)}
                    </td>
                    <td className={clsx("px-4 py-3 tabular-nums text-body", Number(margin) >= 50 ? "text-income" : Number(margin) >= 20 ? "text-amber-600" : isEmpty ? "text-gray-300" : "text-expense")}>
                      {margin !== "—" ? `${margin}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-cream font-semibold">
                <td className="px-4 py-3 text-label font-medium text-gray-500 uppercase">Full Year</td>
                <td className="px-4 py-3 tabular-nums text-income text-body">
                  {fmt(totals.grossIncome)}
                </td>
                <td className="px-4 py-3 tabular-nums text-expense text-body">
                  {fmt(totals.agentCommissions)}
                </td>
                <td className="px-4 py-3 tabular-nums text-expense text-body">
                  {fmt(totals.totalExpenses)}
                </td>
                <td className={clsx("px-4 py-3 tabular-nums text-body font-semibold", totals.netProfit >= 0 ? "text-income" : "text-expense")}>
                  {fmt(totals.netProfit)}
                </td>
                <td className={clsx("px-4 py-3 tabular-nums text-body font-semibold",
                  totals.grossIncome > 0
                    ? (totals.netProfit / totals.grossIncome * 100) >= 50 ? "text-income" : "text-amber-600"
                    : "text-gray-400"
                )}>
                  {totals.grossIncome > 0
                    ? `${(totals.netProfit / totals.grossIncome * 100).toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Download PDF Tab ───────────────────────────────────────────────────────────

function DownloadPDF({ year, month, setYear, setMonth, selectedId }: {
  year: string; month: string;
  setYear: (y: string) => void;
  setMonth: (m: string) => void;
  selectedId?: string | null;
}) {
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, ...(selectedId ? { propertyId: selectedId } : {}) }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `property-report-${year}-${String(month).padStart(2, "0")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded!");
    } catch {
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-md">
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <FileText size={20} className="text-gold" />
          </div>
          <div>
            <h3 className=" text-h3 text-header">Download Owner Report</h3>
            <p className="text-caption text-gray-400 mt-0.5">Full P&L, rent collection & Airbnb performance</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={YEARS}
            />
            <Select
              label="Month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </div>

          <div className="bg-cream rounded-xl p-4 space-y-1.5">
            <p className="text-caption font-medium text-header mb-2">Report includes:</p>
            {[
              "Executive summary (gross income, commissions, expenses, net profit)",
              "Long-term rent collection table",
              "Short-let unit performance",
              "Expense breakdown by category",
              "Full P&L statement with margin",
              "Petty cash reconciliation",
              "Management fee reconciliation",
              "Active alerts & notes",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-caption text-gray-500 ">
                <CheckCircle size={12} className="text-gold shrink-0 mt-0.5" />
                {item}
              </div>
            ))}
          </div>

          <Button onClick={handleGenerate} loading={generating} size="lg" className="w-full" variant="primary">
            <Download size={18} />
            {generating ? "Generating PDF…" : `Download ${MONTHS[Number(month) - 1]} ${year} PDF`}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Owner Statement Tab ────────────────────────────────────────────────────────

interface StatementLine {
  tenantName: string; unit: string; unitType: string;
  rentExpected: number; rentReceived: number; serviceCharge: number; otherIncome: number; grossTotal: number;
}
interface StatementData {
  propertyId: string; propertyName: string; propertyType: string; period: string; generatedAt: string;
  lines: StatementLine[];
  grossIncome: number; managementFee: number;
  expenses: { category: string; description: string; amount: number }[];
  totalExpenses: number; netPayable: number; notes: string;
  ownerName: string | null; ownerEmail: string | null;
  currency: string;
  payouts: { id: string; amount: number; paidAt: string; method: string | null; reference: string | null }[];
  totalPaidOut: number;
}

function OwnerStatementTab({ year, month, selectedId }: { year: string; month: string; selectedId?: string | null }) {
  const [data, setData]           = useState<StatementData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [emailStmt, setEmailStmt] = useState<StatementData | null>(null);
  const [remitStmt, setRemitStmt] = useState<StatementData | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = selectedId ? `&propertyId=${selectedId}` : "";
    fetch(`/api/report/owner-statement?year=${year}&month=${month}${qs}`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year, month, selectedId]);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!data.length) return <p className="text-center text-gray-400 text-body py-16">No data for this period.</p>;

  const periodLabel = `${MONTHS[Number(month) - 1]} ${year}`;

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={() => exportOwnerStatement(data, periodLabel)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
        >
          <FileDown size={13} /> Export to Excel
        </button>
      </div>
      {data.map(stmt => (
        <Card key={stmt.propertyId}>
          {/* Header */}
          <div className="flex items-start justify-between mb-5 pb-4 border-b border-gray-100">
            <div>
              <h3 className=" text-h3 text-header">{stmt.propertyName}</h3>
              <p className="text-caption text-gray-400 mt-0.5">Owner Remittance Statement · {stmt.period}</p>
              <p className="text-caption text-gray-400 ">Generated {stmt.generatedAt}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <p className="text-label text-gray-400 uppercase ">Net Payable to Owner</p>
                <CurrencyDisplay
                  currency={stmt.currency}
                  amount={stmt.netPayable}
                  size="xl"
                  className={stmt.netPayable >= 0 ? "text-income font-medium" : "text-expense font-medium"}
                />
                {stmt.netPayable > 0 && (
                  stmt.totalPaidOut >= stmt.netPayable * 0.99 ? (
                    <Badge variant="green">Remitted ✓</Badge>
                  ) : stmt.totalPaidOut > 0 ? (
                    <Badge variant="amber">Partly remitted</Badge>
                  ) : (
                    <Badge variant="amber">Not remitted</Badge>
                  )
                )}
              </div>
              <div className="flex items-center gap-2">
                {stmt.netPayable > 0 && stmt.totalPaidOut < stmt.netPayable * 0.99 && (
                  <button
                    onClick={() => setRemitStmt(stmt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium text-gold border border-gold/30 rounded-lg hover:bg-gold/5 transition-colors"
                  >
                    <Banknote size={13} /> Record remittance
                  </button>
                )}
                <button
                  onClick={() => setEmailStmt(stmt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium text-gold border border-gold/30 rounded-lg hover:bg-gold/5 transition-colors"
                >
                  <Mail size={13} /> Email Owner
                </button>
              </div>
            </div>
          </div>

          {/* Per-tenant income lines */}
          <SectionTitle><TrendingUp size={16} className="text-gold" /> Rent Collections</SectionTitle>
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-body">
              <thead>
                <tr className="bg-cream-dark">
                  {["Tenant", "Unit", "Expected", "Received", "Svc Charge", "Other", "Gross Total"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-label font-medium text-gray-400 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stmt.lines.map((line, i) => (
                  <tr key={i} className="border-t border-gray-50 hover:bg-cream/50">
                    <td className="px-3 py-2.5 text-header whitespace-nowrap">{line.tenantName}</td>
                    <td className="px-3 py-2.5 text-gray-500">{line.unit}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-400">{line.rentExpected > 0 ? formatCurrency(line.rentExpected, stmt.currency) : "—"}</td>
                    <td className={clsx("px-3 py-2.5 tabular-nums", line.rentReceived >= line.rentExpected ? "text-income" : "text-expense")}>
                      {formatCurrency(line.rentReceived, stmt.currency)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-500">{line.serviceCharge > 0 ? formatCurrency(line.serviceCharge, stmt.currency) : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-500">{line.otherIncome > 0 ? formatCurrency(line.otherIncome, stmt.currency) : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-income">{formatCurrency(line.grossTotal, stmt.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-cream font-medium">
                  <td colSpan={6} className="px-3 py-2 text-label text-gray-500 uppercase">Total Gross Income</td>
                  <td className="px-3 py-2 tabular-nums text-income">{formatCurrency(stmt.grossIncome, stmt.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions */}
          <SectionTitle><Receipt size={16} className="text-gold" /> Deductions</SectionTitle>
          <div className="space-y-2 max-w-md mb-5">
            <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
              <span className="text-body text-gray-600">Gross Income</span>
              <span className="tabular-nums text-body text-income">{formatCurrency(stmt.grossIncome, stmt.currency)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
              <span className="text-body text-gray-600 pl-4">Less: Management Fee</span>
              <span className="tabular-nums text-body text-expense">({formatCurrency(stmt.managementFee, stmt.currency)})</span>
            </div>
            {stmt.expenses.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                <span className="text-body text-gray-600 pl-4">Less: {CAT_LABELS[e.category] ?? e.category}</span>
                <span className="tabular-nums text-body text-expense">({formatCurrency(e.amount, stmt.currency)})</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 border-t-2 border-gray-200">
              <span className="text-body font-semibold text-header">Net Payable to Owner</span>
              <span className={clsx("tabular-nums text-h3 ", stmt.netPayable >= 0 ? "text-income" : "text-expense")}>
                {formatCurrency(Math.abs(stmt.netPayable), stmt.currency)}
                {stmt.netPayable < 0 && " (deficit)"}
              </span>
            </div>
          </div>

          {/* Remittances recorded against this period */}
          {stmt.payouts?.length > 0 && (
            <div className="mb-4 max-w-md">
              <SectionTitle><Banknote size={16} className="text-gold" /> Remitted to Owner</SectionTitle>
              <div className="space-y-1.5">
                {stmt.payouts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 text-caption text-gray-500">
                    <span>
                      Paid {p.paidAt}
                      {p.method ? ` · ${p.method.replace(/_/g, " ").toLowerCase()}` : ""}
                      {p.reference ? ` · ref ${p.reference}` : ""}
                    </span>
                    <span className="tabular-nums text-income font-medium">{formatCurrency(p.amount, stmt.currency)}</span>
                  </div>
                ))}
                {stmt.totalPaidOut < stmt.netPayable * 0.99 && stmt.netPayable > 0 && (
                  <div className="flex items-center justify-between pt-1.5 text-caption">
                    <span className="text-gray-500 font-medium">Still outstanding</span>
                    <span className="tabular-nums text-expense font-medium">
                      {formatCurrency(stmt.netPayable - stmt.totalPaidOut, stmt.currency)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <p className="text-caption text-gray-400 italic">{stmt.notes}</p>
        </Card>
      ))}
      {emailStmt && (
        <OwnerEmailDraftModal statement={emailStmt} onClose={() => setEmailStmt(null)} />
      )}
      {remitStmt && (
        <RecordRemittanceModal
          propertyId={remitStmt.propertyId}
          propertyName={remitStmt.propertyName}
          period={remitStmt.period}
          currency={remitStmt.currency}
          netPayable={remitStmt.netPayable}
          totalPaidOut={remitStmt.totalPaidOut}
          year={year}
          month={month}
          onClose={() => setRemitStmt(null)}
          onRecorded={(p) => {
            setData((prev) => prev.map((s) =>
              s.propertyId === remitStmt.propertyId
                ? { ...s, payouts: [...(s.payouts ?? []), p], totalPaidOut: (s.totalPaidOut ?? 0) + p.amount }
                : s
            ));
          }}
        />
      )}
    </div>
  );
}

// ── Period Report Tab (quarter or custom month range) ──────────────────────────

function QuarterlyDownload({ quarter, setQuarter, quarterYear, setQuarterYear, selectedId }: {
  quarter: number; setQuarter: (q: number) => void;
  quarterYear: string; setQuarterYear: (y: string) => void;
  selectedId?: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const [mode, setMode]             = useState<"quarter" | "custom">("quarter");
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [fromMonth, setFromMonth]   = useState(`${now.getFullYear()}-01`);
  const [toMonth, setToMonth]       = useState(thisMonthKey);
  const [preview, setPreview]       = useState<ReportData | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const rangeValid = /^\d{4}-\d{2}$/.test(fromMonth) && /^\d{4}-\d{2}$/.test(toMonth) && fromMonth <= toMonth;

  async function handlePreview() {
    if (!rangeValid) { toast.error("Pick a valid month range (from ≤ to)."); return; }
    setPreviewing(true);
    try {
      const qs = new URLSearchParams({ from: fromMonth, to: toMonth });
      if (selectedId) qs.set("propertyId", selectedId);
      const res = await fetch(`/api/report?${qs}`);
      if (!res.ok) throw new Error();
      setPreview(await res.json());
    } catch {
      toast.error("Failed to load the combined summary.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleDownload() {
    setGenerating(true);
    try {
      const body =
        mode === "quarter"
          ? { type: "quarterly", quarter, year: quarterYear }
          : { type: "range", from: fromMonth, to: toMonth };
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(selectedId ? { propertyId: selectedId } : {}) }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = mode === "quarter"
        ? `property-report-Q${quarter}-${quarterYear}.pdf`
        : `property-report-${fromMonth}-to-${toMonth}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Period report downloaded!");
    } catch {
      toast.error("Failed to generate the report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const QUARTER_MONTHS: Record<number, string> = { 1: "Jan–Mar", 2: "Apr–Jun", 3: "Jul–Sep", 4: "Oct–Dec" };

  return (
    <div className="max-w-md">
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Calendar size={20} className="text-gold" />
          </div>
          <div>
            <h3 className=" text-h3 text-header">Period Report</h3>
            <p className="text-caption text-gray-400 mt-0.5">Aggregate any months together — quarter or a custom range</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            {([["quarter", "Quarter"], ["custom", "Custom months"]] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={clsx(
                  "flex-1 py-2 rounded-lg text-body font-medium transition-all border",
                  mode === m
                    ? "bg-gold text-white border-gold"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gold/50 hover:text-gold-dark",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "custom" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-caption text-gray-500 mb-1">From month</label>
                  <input
                    type="month"
                    value={fromMonth}
                    onChange={(e) => { setFromMonth(e.target.value); setPreview(null); }}
                    max={thisMonthKey}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body bg-cream focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                </div>
                <div>
                  <label className="block text-caption text-gray-500 mb-1">To month</label>
                  <input
                    type="month"
                    value={toMonth}
                    onChange={(e) => { setToMonth(e.target.value); setPreview(null); }}
                    max={thisMonthKey}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body bg-cream focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                </div>
              </div>

              <Button onClick={handlePreview} loading={previewing} variant="secondary" className="w-full">
                Review these months together
              </Button>

              {preview && (
                <div className="bg-cream rounded-xl p-4 space-y-1.5">
                  <p className="text-caption font-medium text-header mb-1">{preview.period}</p>
                  {[
                    ["Gross income", preview.kpis.grossIncome],
                    ["Agent commissions", -preview.kpis.agentCommissions],
                    ["Operating expenses", -preview.kpis.totalExpenses],
                    ["Net profit", preview.kpis.netProfit],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-center justify-between text-caption">
                      <span className="text-gray-500">{label}</span>
                      <span className={clsx("font-medium tabular-nums", (value as number) < 0 ? "text-expense" : "text-header")}>
                        {formatCurrency(value as number, preview.currency)}
                      </span>
                    </div>
                  ))}
                  {preview.kpis.incomeToDate != null && (
                    <div className="flex items-center justify-between text-caption border-t border-gray-200 pt-1.5 mt-1.5">
                      <span className="text-gray-500">Total income to date (all time)</span>
                      <span className="font-medium tabular-nums text-income">
                        {formatCurrency(preview.kpis.incomeToDate, preview.currency)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {mode === "quarter" && (
          <div className="space-y-4">
          {/* Quarter selector */}
          <div>
            <p className="text-label font-medium text-gray-500 uppercase mb-2">Quarter</p>
            <div className="flex gap-2">
              {([1, 2, 3, 4] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuarter(q)}
                  className={clsx(
                    "flex-1 py-2 rounded-lg text-body font-medium transition-all border",
                    quarter === q
                      ? "bg-gold text-white border-gold"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gold/50 hover:text-gold-dark",
                  )}
                >
                  Q{q}
                  <span className="block text-caption opacity-80">{QUARTER_MONTHS[q]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Year selector */}
          <Select
            label="Year"
            value={quarterYear}
            onChange={(e) => setQuarterYear(e.target.value)}
            options={YEARS}
          />

          <div className="bg-cream rounded-xl p-4 space-y-1.5">
            <p className="text-caption font-medium text-header mb-2">Report includes:</p>
            {[
              "3-month aggregated gross income & expenses",
              "Long-term rent collection (all 3 months combined)",
              "Short-let unit performance (quarterly)",
              "Net profit & margin for the quarter",
              "Management fee reconciliation",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-caption text-gray-500 ">
                <CheckCircle size={12} className="text-gold shrink-0 mt-0.5" />
                {item}
              </div>
            ))}
          </div>
          </div>
          )}

          <Button
            onClick={handleDownload}
            loading={generating}
            size="lg"
            className="w-full"
            variant="primary"
            disabled={mode === "custom" && !rangeValid}
          >
            <Download size={18} />
            {generating
              ? "Generating PDF…"
              : mode === "quarter"
                ? `Download Q${quarter} ${quarterYear} PDF`
                : `Download ${fromMonth} – ${toMonth} PDF`}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const { data: session }               = useSession();
  const { selectedId }                  = useProperty();
  const [activeTab, setActiveTab]       = useState<Tab>("preview");
  const [year, setYear]                 = useState(String(currentYear));
  const [month, setMonth]               = useState(String(currentMonth));
  const [quarter, setQuarter]           = useState(Math.ceil(currentMonth / 3));
  const [quarterYear, setQuarterYear]   = useState(String(currentYear));

  // OWNER role gets a read-only dashboard instead of the manager tab system
  if (session?.user?.role === "OWNER") {
    return (
      <div>
        <Header
          title="Owner Dashboard"
          userName={session?.user?.name ?? session?.user?.email}
          role={session?.user?.role}
        />
        <div className="page-container space-y-5">
          <OwnerDashboard />
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "preview",   label: "P&L Preview",       icon: <TrendingUp size={15} /> },
    { id: "annual",    label: "Annual Summary",     icon: <Receipt size={15} /> },
    { id: "owner",     label: "Owner Statement",    icon: <DollarSign size={15} /> },
    { id: "tax",       label: "Tax Summary",        icon: <BarChart2 size={15} /> },
    { id: "download",  label: "Download PDF",       icon: <Download size={15} /> },
    { id: "quarterly", label: "Period Report",      icon: <Calendar size={15} /> },
  ];

  return (
    <div>
      <Header
        title="Reports"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      />
      <div className="page-container space-y-5">

        {/* Period selector + Tabs */}
        <Card padding="sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            {/* Period pickers */}
            {activeTab === "quarterly" ? (
              <div className="flex items-center gap-2">
                {([1, 2, 3, 4] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuarter(q)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-body font-medium transition-all border",
                      quarter === q
                        ? "bg-gold text-white border-gold"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gold/50 hover:text-gold-dark",
                    )}
                  >
                    Q{q}
                  </button>
                ))}
                <Select
                  value={quarterYear}
                  onChange={(e) => setQuarterYear(e.target.value)}
                  options={YEARS}
                />
              </div>
            ) : (
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
            )}

            {/* Divider */}
            <div className="hidden sm:block w-px h-8 bg-gray-200" />

            {/* Tabs */}
            <div className="flex gap-1 bg-cream rounded-xl p-1 flex-wrap">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2 rounded-lg text-body font-medium transition-all",
                    activeTab === t.id
                      ? "bg-white text-header shadow-sm"
                      : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  {t.icon}
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">
                    {t.id === "preview" ? "P&L" : t.id === "annual" ? "Annual" : t.id === "owner" ? "Owner" : t.id === "tax" ? "Tax" : t.id === "quarterly" ? "Period" : "PDF"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Tab content */}
        {activeTab === "preview"   && <PLPreview year={year} month={month} selectedId={selectedId} />}
        {activeTab === "annual"    && <AnnualSummary year={year} selectedId={selectedId} />}
        {activeTab === "owner"     && <OwnerStatementTab year={year} month={month} selectedId={selectedId} />}
        {activeTab === "tax"       && <TaxSummaryTab year={year} month={month} selectedId={selectedId} />}
        {activeTab === "download"  && <DownloadPDF year={year} month={month} setYear={setYear} setMonth={setMonth} selectedId={selectedId} />}
        {activeTab === "quarterly" && (
          <QuarterlyDownload
            quarter={quarter} setQuarter={setQuarter}
            quarterYear={quarterYear} setQuarterYear={setQuarterYear}
            selectedId={selectedId}
          />
        )}
      </div>
    </div>
  );
}
