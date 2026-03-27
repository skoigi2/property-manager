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
  Wallet, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, FileDown, Building2, Calendar,
} from "lucide-react";
import { exportOwnerStatement, exportAnnualSummary } from "@/lib/excel-export";
import { clsx } from "clsx";
import type { ReportData } from "@/types/report";
import { useProperty } from "@/lib/property-context";

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

type Tab = "preview" | "annual" | "owner" | "download" | "quarterly";

// ── Helpers ────────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400 font-sans uppercase tracking-wide">{label}</span>
      <CurrencyDisplay amount={value} className={`font-medium ${color}`} size="md" />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-base text-header mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
      {children}
    </h3>
  );
}

function AmountCell({ value, strikethrough = false }: { value: number; strikethrough?: boolean }) {
  return (
    <span className={clsx(
      "font-mono text-sm",
      value < 0 ? "text-expense" : value > 0 ? "text-income" : "text-gray-400",
      strikethrough && "line-through text-gray-400",
    )}>
      KSh {Math.abs(value).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
    </span>
  );
}

// ── P&L Preview Tab ────────────────────────────────────────────────────────────

function PLPreview({ year, month, selectedId }: { year: string; month: string; selectedId?: string | null }) {
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
  if (!data)   return <p className="text-center text-gray-400 text-sm py-16">Failed to load report data.</p>;

  const margin = data.kpis.grossIncome > 0
    ? ((data.kpis.netProfit / data.kpis.grossIncome) * 100).toFixed(1)
    : "0.0";

  const opExpenses  = data.expenses.filter((e) => !e.isSunkCost);
  const sunkExpenses = data.expenses.filter((e) => e.isSunkCost);

  return (
    <div className="space-y-5">
      {/* Meta */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-display text-lg text-header">{data.title}</p>
          <p className="text-xs text-gray-400 font-sans mt-0.5">Generated {data.generatedAt} · by {data.generatedBy}</p>
        </div>
        {data.alerts.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-full">
            <AlertTriangle size={13} />
            {data.alerts.length} alert{data.alerts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Gross Income",    value: data.kpis.grossIncome,       icon: <TrendingUp size={16} />,  color: "text-income",  border: "border-income" },
          { label: "Commissions",     value: data.kpis.agentCommissions,  icon: <DollarSign size={16} />,  color: "text-expense", border: "border-expense" },
          { label: "Total Expenses",  value: data.kpis.totalExpenses,     icon: <Receipt size={16} />,     color: "text-expense", border: "border-expense" },
          { label: "Net Profit",      value: data.kpis.netProfit,         icon: <Wallet size={16} />,      color: data.kpis.netProfit >= 0 ? "text-income" : "text-expense", border: data.kpis.netProfit >= 0 ? "border-income" : "border-expense" },
        ].map((k) => (
          <Card key={k.label} padding="sm" className={`border-l-4 ${k.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={k.color}>{k.icon}</span>
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">{k.label}</p>
            </div>
            <CurrencyDisplay amount={k.value} className={`${k.color} font-medium`} size="lg" />
          </Card>
        ))}
        <Card padding="sm" className={`border-l-4 ${data.kpis.occupancyRate >= 80 ? "border-income" : "border-amber-400"}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={data.kpis.occupancyRate >= 80 ? "text-income" : "text-amber-500"}><Building2 size={16} /></span>
            <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Occupancy</p>
          </div>
          <p className={`text-2xl font-mono font-semibold ${data.kpis.occupancyRate >= 80 ? "text-income" : "text-amber-500"}`}>
            {data.kpis.occupancyRate}%
          </p>
        </Card>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card className="border border-amber-100 bg-amber-50/50">
          <SectionTitle><AlertTriangle size={16} className="text-amber-500" /> Alerts</SectionTitle>
          <ul className="space-y-1.5">
            {data.alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm font-sans text-amber-700">
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Tenant", "Unit", "Expected", "Svc Charge", "Received", "Variance", "Lease"].map((h) => (
                    <th key={h} className="pb-2 text-left text-xs font-medium text-gray-400 font-sans uppercase tracking-wide pr-4 last:pr-0">{h}</th>
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
                      <td className="py-2.5 pr-4 font-sans text-header">{row.tenantName}</td>
                      <td className="py-2.5 pr-4 font-mono text-gray-500">{row.unit}</td>
                      <td className="py-2.5 pr-4 font-mono text-gray-600">
                        {row.expectedRent.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-gray-500">
                        {row.serviceCharge.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </td>
                      <td className={clsx("py-2.5 pr-4 font-mono font-medium", isPaid ? "text-income" : row.received > 0 ? "text-amber-600" : "text-expense")}>
                        {row.received.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </td>
                      <td className={clsx("py-2.5 pr-4 font-mono", variance >= 0 ? "text-income" : "text-expense")}>
                        {variance >= 0 ? "+" : ""}{variance.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
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
                  <td colSpan={2} className="py-2 pr-4 text-xs font-medium font-sans text-gray-500 uppercase">Total</td>
                  <td className="py-2 pr-4 font-mono text-sm font-medium text-header">
                    {data.rentCollection.reduce((s, r) => s + r.expectedRent, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 pr-4 font-mono text-sm text-gray-500">
                    {data.rentCollection.reduce((s, r) => s + r.serviceCharge, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 pr-4 font-mono text-sm font-medium text-income">
                    {data.rentCollection.reduce((s, r) => s + r.received, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </td>
                  <td colSpan={2} />
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
            <table className="w-full min-w-[580px] text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Unit", "Type", "Gross Revenue", "Commissions", "Fixed Costs", "Variable", "Net Revenue", "Occupancy"].map((h) => (
                    <th key={h} className="pb-2 text-left text-xs font-medium text-gray-400 font-sans uppercase tracking-wide pr-4 last:pr-0">{h}</th>
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
                      <td className="py-2.5 pr-4 font-mono font-medium text-header">{row.unitNumber}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="blue">{row.type.replace("_", " ")}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-income">
                        {row.grossRevenue.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-expense">
                        {row.commissions.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-gray-500">
                        {row.fixedCosts.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-gray-500">
                        {row.variableCosts.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </td>
                      <td className={clsx("py-2.5 pr-4 font-mono font-medium", row.netRevenue >= 0 ? "text-income" : "text-expense")}>
                        {row.netRevenue.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2.5">
                        <span className={clsx("font-mono text-sm font-medium",
                          occupancy >= 70 ? "text-income" : occupancy >= 40 ? "text-amber-600" : "text-expense"
                        )}>
                          {occupancy}%
                        </span>
                        <span className="text-xs text-gray-400 font-sans ml-1">({row.bookedNights}d)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-cream">
                  <td colSpan={2} className="py-2 pr-4 text-xs font-medium font-sans text-gray-500 uppercase">Total</td>
                  <td className="py-2 pr-4 font-mono text-sm text-income font-medium">
                    {data.albaPerformance.reduce((s, r) => s + r.grossRevenue, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 pr-4 font-mono text-sm text-expense">
                    {data.albaPerformance.reduce((s, r) => s + r.commissions, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 pr-4 font-mono text-sm text-gray-500">
                    {data.albaPerformance.reduce((s, r) => s + r.fixedCosts, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 pr-4 font-mono text-sm text-gray-500">
                    {data.albaPerformance.reduce((s, r) => s + r.variableCosts, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 font-mono text-sm font-medium text-income">
                    {data.albaPerformance.reduce((s, r) => s + r.netRevenue, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
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
              <span className="text-sm font-sans text-gray-600">{CAT_LABELS[e.category] ?? e.category}</span>
              <AmountCell value={-e.amount} />
            </div>
          ))}
          {sunkExpenses.length > 0 && (
            <>
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide pt-2">Capital / Sunk Costs (excluded from P&L)</p>
              {sunkExpenses.map((e) => (
                <div key={e.category} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 opacity-60">
                  <span className="text-sm font-sans text-gray-500">{CAT_LABELS[e.category] ?? e.category}</span>
                  <AmountCell value={-e.amount} strikethrough />
                </div>
              ))}
            </>
          )}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <span className="text-sm font-medium font-sans text-header">Total Operating Expenses</span>
            <span className="font-mono text-sm font-bold text-expense">
              KSh {opExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </Card>

      {/* P&L Statement */}
      <Card>
        <SectionTitle><TrendingUp size={16} className="text-gold" /> Profit & Loss Statement</SectionTitle>
        <div className="space-y-2 max-w-sm">
          {[
            { label: "Gross Income",         value: data.kpis.grossIncome,                    bold: false, indent: false },
            { label: "Less: Commissions",    value: -data.kpis.agentCommissions,              bold: false, indent: true },
            { label: "Net Income",           value: data.kpis.grossIncome - data.kpis.agentCommissions, bold: true, indent: false },
            { label: "Less: Expenses",       value: -data.kpis.totalExpenses,                 bold: false, indent: true },
            { label: "Net Profit",           value: data.kpis.netProfit,                       bold: true,  indent: false },
          ].map((row) => (
            <div key={row.label} className={clsx(
              "flex items-center justify-between py-1.5",
              row.bold ? "border-t border-gray-200 pt-3 mt-1" : "border-b border-gray-50",
            )}>
              <span className={clsx("font-sans text-sm", row.bold ? "font-semibold text-header" : "text-gray-600", row.indent && "pl-4")}>
                {row.label}
              </span>
              <span className={clsx(
                "font-mono text-sm",
                row.bold ? "font-bold" : "font-medium",
                row.value >= 0 ? "text-income" : "text-expense",
              )}>
                {row.value < 0 ? "-" : ""}KSh {Math.abs(row.value).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-400 font-sans">Profit Margin</span>
            <span className={clsx("font-mono text-sm font-medium", Number(margin) >= 0 ? "text-income" : "text-expense")}>
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
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">{s.label}</p>
              <CurrencyDisplay amount={s.value} className={`font-medium ${s.color}`} size="md" />
            </div>
          ))}
        </div>
        {data.pettyCash.entries.length > 0 && (
          <button
            onClick={() => setPcExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gold font-sans font-medium"
          >
            {pcExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {pcExpanded ? "Hide" : "Show"} {data.pettyCash.entries.length} entries
          </button>
        )}
        {pcExpanded && (
          <div className="mt-3 overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-cream-dark">
                <tr>
                  {["Date", "Description", "In", "Out"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pettyCash.entries.map((e, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-500 font-sans">{e.date}</td>
                    <td className="px-3 py-2 text-header font-sans">{e.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-income">{e.type === "IN" ? `KSh ${e.amount.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-expense">{e.type === "OUT" ? `KSh ${e.amount.toLocaleString()}` : "—"}</td>
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
            { label: "Fees Owing", value: data.mgmtFee.owing, color: "text-expense" },
            { label: "Fees Paid",  value: data.mgmtFee.paid,  color: "text-income" },
            { label: "Balance",    value: data.mgmtFee.balance, color: data.mgmtFee.balance >= 0 ? "text-income" : "text-expense" },
          ].map((s) => (
            <div key={s.label} className="bg-cream rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">{s.label}</p>
              <CurrencyDisplay amount={s.value} className={`font-medium ${s.color}`} size="md" />
            </div>
          ))}
        </div>
        {data.mgmtFee.balance >= 0 ? (
          <div className="flex items-center gap-2 mt-3 text-income text-sm font-sans">
            <CheckCircle size={14} /> Management fee fully settled
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-3 text-expense text-sm font-sans">
            <AlertTriangle size={14} /> Outstanding: KSh {Math.abs(data.mgmtFee.balance).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Annual Summary Tab ─────────────────────────────────────────────────────────

function AnnualSummary({ year, selectedId }: { year: string; selectedId?: string | null }) {
  const [months, setMonths]   = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = selectedId ? `&propertyId=${selectedId}` : "";
    fetch(`/api/report?year=${year}${qs}`)
      .then((r) => r.json())
      .then((d) => { setMonths(d.months ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year, selectedId]);

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
      {/* Export button */}
      {months.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => exportAnnualSummary(months, year)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
          >
            <FileDown size={13} /> Export to Excel
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
            <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">{k.label}</p>
            <CurrencyDisplay amount={k.value} className={`${k.color} font-medium`} size="lg" />
          </Card>
        ))}
      </div>

      {bestMonth && (
        <div className="flex items-center gap-2 text-sm font-sans text-gray-500 bg-cream rounded-xl px-4 py-2.5">
          <TrendingUp size={14} className="text-gold" />
          Best month: <span className="font-medium text-header">{bestMonth.label} {year}</span>
          &nbsp;· KSh {bestMonth.netProfit.toLocaleString("en-KE", { maximumFractionDigits: 0 })} net profit
        </div>
      )}

      {/* Monthly Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-cream-dark">
              <tr>
                {["Month", "Gross Income", "Commissions", "Expenses", "Net Profit", "Margin"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
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
                    <td className="px-4 py-3 font-medium font-sans text-header">
                      {m.label}
                      {m.month === currentMonth && Number(year) === currentYear && (
                        <span className="ml-2 text-xs text-gold font-sans">(current)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-income">
                      {m.grossIncome > 0 ? m.grossIncome.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-expense">
                      {m.agentCommissions > 0 ? m.agentCommissions.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-expense">
                      {m.totalExpenses > 0 ? m.totalExpenses.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
                    </td>
                    <td className={clsx("px-4 py-3 font-mono font-medium", m.netProfit >= 0 ? "text-income" : "text-expense")}>
                      {isEmpty ? "—" : m.netProfit.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                    </td>
                    <td className={clsx("px-4 py-3 font-mono text-sm", Number(margin) >= 50 ? "text-income" : Number(margin) >= 20 ? "text-amber-600" : isEmpty ? "text-gray-300" : "text-expense")}>
                      {margin !== "—" ? `${margin}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-cream font-semibold">
                <td className="px-4 py-3 text-xs font-medium font-sans text-gray-500 uppercase">Full Year</td>
                <td className="px-4 py-3 font-mono text-income text-sm">
                  {totals.grossIncome.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 font-mono text-expense text-sm">
                  {totals.agentCommissions.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 font-mono text-expense text-sm">
                  {totals.totalExpenses.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                </td>
                <td className={clsx("px-4 py-3 font-mono text-sm font-bold", totals.netProfit >= 0 ? "text-income" : "text-expense")}>
                  {totals.netProfit.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                </td>
                <td className={clsx("px-4 py-3 font-mono text-sm font-bold",
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
            <h3 className="font-display text-base text-header">Download Owner Report</h3>
            <p className="text-xs text-gray-400 font-sans mt-0.5">Full P&L, rent collection & Airbnb performance</p>
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
            <p className="text-xs font-medium font-sans text-header mb-2">Report includes:</p>
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
              <div key={item} className="flex items-start gap-2 text-xs text-gray-500 font-sans">
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
}

function OwnerStatementTab({ year, month, selectedId }: { year: string; month: string; selectedId?: string | null }) {
  const [data, setData]       = useState<StatementData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = selectedId ? `&propertyId=${selectedId}` : "";
    fetch(`/api/report/owner-statement?year=${year}&month=${month}${qs}`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year, month, selectedId]);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!data.length) return <p className="text-center text-gray-400 text-sm py-16">No data for this period.</p>;

  const periodLabel = `${MONTHS[Number(month) - 1]} ${year}`;

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={() => exportOwnerStatement(data, periodLabel)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
        >
          <FileDown size={13} /> Export to Excel
        </button>
      </div>
      {data.map(stmt => (
        <Card key={stmt.propertyId}>
          {/* Header */}
          <div className="flex items-start justify-between mb-5 pb-4 border-b border-gray-100">
            <div>
              <h3 className="font-display text-lg text-header">{stmt.propertyName}</h3>
              <p className="text-xs text-gray-400 font-sans mt-0.5">Owner Remittance Statement · {stmt.period}</p>
              <p className="text-xs text-gray-400 font-sans">Generated {stmt.generatedAt}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Net Payable to Owner</p>
              <CurrencyDisplay
                amount={stmt.netPayable}
                size="xl"
                className={stmt.netPayable >= 0 ? "text-income font-medium" : "text-expense font-medium"}
              />
            </div>
          </div>

          {/* Per-tenant income lines */}
          <SectionTitle><TrendingUp size={16} className="text-gold" /> Rent Collections</SectionTitle>
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-dark">
                  {["Tenant", "Unit", "Expected", "Received", "Svc Charge", "Other", "Gross Total"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stmt.lines.map((line, i) => (
                  <tr key={i} className="border-t border-gray-50 hover:bg-cream/50">
                    <td className="px-3 py-2.5 font-sans text-header whitespace-nowrap">{line.tenantName}</td>
                    <td className="px-3 py-2.5 font-sans text-gray-500">{line.unit}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-400">{line.rentExpected > 0 ? line.rentExpected.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}</td>
                    <td className={clsx("px-3 py-2.5 font-mono", line.rentReceived >= line.rentExpected ? "text-income" : "text-expense")}>
                      {line.rentReceived.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">{line.serviceCharge > 0 ? line.serviceCharge.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">{line.otherIncome > 0 ? line.otherIncome.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}</td>
                    <td className="px-3 py-2.5 font-mono font-medium text-income">{line.grossTotal.toLocaleString("en-KE", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-cream font-medium">
                  <td colSpan={6} className="px-3 py-2 text-xs font-sans text-gray-500 uppercase">Total Gross Income</td>
                  <td className="px-3 py-2 font-mono text-income">{stmt.grossIncome.toLocaleString("en-KE", { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions */}
          <SectionTitle><Receipt size={16} className="text-gold" /> Deductions</SectionTitle>
          <div className="space-y-2 max-w-md mb-5">
            <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
              <span className="text-sm font-sans text-gray-600">Gross Income</span>
              <span className="font-mono text-sm text-income">{stmt.grossIncome.toLocaleString("en-KE", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
              <span className="text-sm font-sans text-gray-600 pl-4">Less: Management Fee</span>
              <span className="font-mono text-sm text-expense">({stmt.managementFee.toLocaleString("en-KE", { maximumFractionDigits: 0 })})</span>
            </div>
            {stmt.expenses.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                <span className="text-sm font-sans text-gray-600 pl-4">Less: {CAT_LABELS[e.category] ?? e.category}</span>
                <span className="font-mono text-sm text-expense">({e.amount.toLocaleString("en-KE", { maximumFractionDigits: 0 })})</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 border-t-2 border-gray-200">
              <span className="text-sm font-semibold font-sans text-header">Net Payable to Owner</span>
              <span className={clsx("font-mono text-base font-bold", stmt.netPayable >= 0 ? "text-income" : "text-expense")}>
                KSh {Math.abs(stmt.netPayable).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                {stmt.netPayable < 0 && " (deficit)"}
              </span>
            </div>
          </div>

          {/* Notes */}
          <p className="text-xs text-gray-400 font-sans italic">{stmt.notes}</p>
        </Card>
      ))}
    </div>
  );
}

// ── Quarterly Download Tab ─────────────────────────────────────────────────────

function QuarterlyDownload({ quarter, setQuarter, quarterYear, setQuarterYear, selectedId }: {
  quarter: number; setQuarter: (q: number) => void;
  quarterYear: string; setQuarterYear: (y: string) => void;
  selectedId?: string | null;
}) {
  const [generating, setGenerating] = useState(false);

  async function handleDownload() {
    setGenerating(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "quarterly",
          quarter,
          year: quarterYear,
          ...(selectedId ? { propertyId: selectedId } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `property-report-Q${quarter}-${quarterYear}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Quarterly report downloaded!");
    } catch {
      toast.error("Failed to generate quarterly report. Please try again.");
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
            <h3 className="font-display text-base text-header">Download Quarterly Report</h3>
            <p className="text-xs text-gray-400 font-sans mt-0.5">3-month aggregated P&L, rent & Airbnb performance</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Quarter selector */}
          <div>
            <p className="text-xs font-medium text-gray-500 font-sans uppercase tracking-wide mb-2">Quarter</p>
            <div className="flex gap-2">
              {([1, 2, 3, 4] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuarter(q)}
                  className={clsx(
                    "flex-1 py-2 rounded-lg text-sm font-medium font-sans transition-all border",
                    quarter === q
                      ? "bg-gold text-white border-gold"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gold/50 hover:text-gold-dark",
                  )}
                >
                  Q{q}
                  <span className="block text-xs font-normal opacity-80">{QUARTER_MONTHS[q]}</span>
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
            <p className="text-xs font-medium font-sans text-header mb-2">Report includes:</p>
            {[
              "3-month aggregated gross income & expenses",
              "Long-term rent collection (all 3 months combined)",
              "Short-let unit performance (quarterly)",
              "Net profit & margin for the quarter",
              "Management fee reconciliation",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-xs text-gray-500 font-sans">
                <CheckCircle size={12} className="text-gold shrink-0 mt-0.5" />
                {item}
              </div>
            ))}
          </div>

          <Button onClick={handleDownload} loading={generating} size="lg" className="w-full" variant="primary">
            <Download size={18} />
            {generating ? "Generating PDF…" : `Download Q${quarter} ${quarterYear} PDF`}
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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "preview",   label: "P&L Preview",       icon: <TrendingUp size={15} /> },
    { id: "annual",    label: "Annual Summary",     icon: <Receipt size={15} /> },
    { id: "owner",     label: "Owner Statement",    icon: <DollarSign size={15} /> },
    { id: "download",  label: "Download PDF",       icon: <Download size={15} /> },
    { id: "quarterly", label: "Quarterly Report",   icon: <Calendar size={15} /> },
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
                      "px-3 py-1.5 rounded-lg text-sm font-medium font-sans transition-all border",
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
                    "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium font-sans transition-all",
                    activeTab === t.id
                      ? "bg-white text-header shadow-sm"
                      : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  {t.icon}
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">
                    {t.id === "preview" ? "P&L" : t.id === "annual" ? "Annual" : t.id === "owner" ? "Owner" : t.id === "quarterly" ? "Qtrly" : "PDF"}
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
