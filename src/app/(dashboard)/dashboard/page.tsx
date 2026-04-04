"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { KPICard } from "@/components/dashboard/KPICard";
import { RentStatusTable } from "@/components/dashboard/RentStatusTable";
import { AlbaRevenueTable } from "@/components/dashboard/AlbaRevenueTable";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Header } from "@/components/layout/Header";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import {
  TrendingUp, Wallet, Receipt, AlertTriangle, DollarSign,
  Calendar, ScrollText, Wrench, AlertCircle, ChevronRight,
  CheckCircle, RepeatIcon, Building2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useProperty } from "@/lib/property-context";
import { formatCurrency } from "@/lib/currency";
import { clsx } from "clsx";

// ── Action Card ────────────────────────────────────────────────────────────────

function ActionCard({ icon, title, severity, lines, href }: {
  icon: React.ReactNode;
  title: string;
  severity: "red" | "amber" | "green";
  lines: string[];
  href: string;
}) {
  const c = {
    red:   { border: "border-red-200",   bg: "bg-red-50/50",   iconColor: "text-red-500",   chevron: "text-red-300"   },
    amber: { border: "border-amber-200", bg: "bg-amber-50/50", iconColor: "text-amber-500", chevron: "text-amber-300" },
    green: { border: "border-green-100", bg: "bg-green-50/30", iconColor: "text-green-500", chevron: "text-green-300" },
  }[severity];

  return (
    <Link
      href={href}
      className={`flex items-start gap-3 rounded-xl border ${c.border} ${c.bg} p-4 hover:shadow-sm transition-shadow`}
    >
      <div className={`shrink-0 mt-0.5 ${c.iconColor}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-sans font-semibold text-sm text-header">{title}</p>
        {lines.map((line, i) => (
          <p key={i} className="text-xs text-gray-500 font-sans mt-0.5 leading-snug">{line}</p>
        ))}
      </div>
      <ChevronRight size={14} className={`${c.chevron} shrink-0 mt-1`} />
    </Link>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session } = useSession();
  const { selectedId, selected } = useProperty();
  const currency = selected?.currency ?? "USD";
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opsData, setOpsData] = useState<any>(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const [tab, setTab] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setOpsLoading(true);
    const params = new URLSearchParams({
      year: String(month.getFullYear()),
      month: String(month.getMonth() + 1),
    });
    if (selectedId) params.set("propertyId", selectedId);

    // Fire both fetches concurrently — critical data controls the main spinner
    fetch(`/api/dashboard?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.properties?.length > 0) {
          setTab((prev) => prev ?? d.properties[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch(`/api/dashboard/ops?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setOpsData(d);
        setOpsLoading(false);
      })
      .catch(() => setOpsLoading(false));
  }, [month, selectedId]);

  // Reset tab when properties change
  useEffect(() => {
    if (data?.properties?.length > 0) {
      const ids = data.properties.map((p: any) => p.id);
      if (!ids.includes(tab)) setTab(ids[0]);
    }
  }, [data?.properties]);

  const activeProperty = data?.properties?.find((p: any) => p.id === tab);

  const today = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // ── Attention card computed values ──────────────────────────────────────────
  const criticalLeases = (data?.alerts?.leaseAlerts ?? []).filter((a: any) => a.status === "CRITICAL").length;
  const warningLeases  = (data?.alerts?.leaseAlerts ?? []).filter((a: any) => a.status === "WARNING").length;
  const tbcLeases      = (data?.alerts?.leaseAlerts ?? []).filter((a: any) => a.status === "TBC").length;
  const noRentCount    = data?.alerts?.noRentAlerts?.length ?? 0;
  const maint          = opsData?.maintenanceSummary ?? { urgent: 0, high: 0, open: 0 };
  const arrears        = opsData?.arrearsSummary     ?? { openCases: 0, totalOwed: 0, escalated: 0 };
  const invSum         = opsData?.invoiceSummary     ?? { count: 0, amount: 0 };

  const leaseSev   = criticalLeases > 0 ? "red" : (warningLeases > 0 || tbcLeases > 0) ? "amber" : "green";
  const rentSev    = (noRentCount > 0 || invSum.count > 0) ? "amber" : "green";
  const maintSev   = maint.urgent > 0 ? "red" : (maint.high > 0 || maint.open > 0) ? "amber" : "green";
  const arrearsSev = arrears.escalated > 0 ? "red" : arrears.openCases > 0 ? "amber" : "green";
  const allClear   = leaseSev === "green" && rentSev === "green" && maintSev === "green" && arrearsSev === "green";

  const leaseLines = criticalLeases === 0 && warningLeases === 0 && tbcLeases === 0
    ? ["All leases current"]
    : [
        ...(criticalLeases > 0 ? [`${criticalLeases} lease${criticalLeases > 1 ? "s" : ""} expired`] : []),
        ...(warningLeases  > 0 ? [`${warningLeases} expiring within 60 days`] : []),
        ...(tbcLeases      > 0 ? [`${tbcLeases} with no end date set`] : []),
      ];

  const rentLines = noRentCount === 0 && invSum.count === 0
    ? ["All rent collected this month"]
    : [
        ...(noRentCount > 0  ? [`${noRentCount} tenant${noRentCount > 1 ? "s" : ""} not yet paid`] : []),
        ...(invSum.count > 0 ? [`${invSum.count} overdue invoice${invSum.count > 1 ? "s" : ""} — ${formatCurrency(invSum.amount, currency)}`] : []),
      ];

  const maintLines = maint.open === 0
    ? ["No open maintenance jobs"]
    : [
        ...(maint.urgent + maint.high > 0 ? [`${maint.urgent + maint.high} urgent/high priority`] : []),
        `${maint.open} job${maint.open > 1 ? "s" : ""} total open`,
      ];

  const arrearsLines = arrears.openCases === 0
    ? ["No active arrears cases"]
    : [
        `${arrears.openCases} active case${arrears.openCases > 1 ? "s" : ""}`,
        ...(arrears.escalated > 0 ? [`${arrears.escalated} escalated to legal/eviction`] : []),
        ...(arrears.totalOwed > 0 ? [`${formatCurrency(arrears.totalOwed, currency)} total owed`] : []),
      ];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <Header
        title="Dashboard"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      />

      <div className="page-container space-y-6">
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

        {loading ? (
          <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
        ) : data ? (
          <>
            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KPICard
                currency={currency}
                label="Gross Income"
                amount={data.kpis.totalGrossIncome}
                type="income"
                icon={<TrendingUp size={18} />}
              />
              <KPICard
                currency={currency}
                label="Net Profit"
                amount={data.kpis.netProfit}
                type="balance"
                icon={<Wallet size={18} />}
                subtext={data.kpis.totalGrossIncome > 0
                  ? `${((data.kpis.netProfit / data.kpis.totalGrossIncome) * 100).toFixed(1)}% margin`
                  : undefined}
              />
              <KPICard
                currency={currency}
                label="Outstanding"
                amount={invSum.amount}
                type={invSum.amount > 0 ? "neutral" : "income"}
                icon={<Receipt size={18} />}
                subtext={invSum.count > 0 ? `${invSum.count} invoice${invSum.count > 1 ? "s" : ""}` : "All invoices paid"}
              />
              <KPICard
                currency={currency}
                label="Arrears Owed"
                amount={arrears.totalOwed}
                type={arrears.totalOwed > 0 ? "expense" : "income"}
                icon={<AlertTriangle size={18} />}
                subtext={arrears.openCases > 0 ? `${arrears.openCases} open case${arrears.openCases > 1 ? "s" : ""}` : "No active cases"}
              />
              <KPICard
                currency={currency}
                label="Petty Cash"
                amount={data.kpis.pettyCashBalance}
                type="balance"
                icon={<DollarSign size={18} />}
                subtext="Current balance"
              />
            </div>

            {/* ── Attention Required ────────────────────────────────────────── */}
            <div>
              <h2 className="section-header mb-3">Attention Required</h2>
              {allClear ? (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <CheckCircle size={18} className="text-green-500 shrink-0" />
                  <p className="text-sm font-sans text-green-700 font-medium">
                    All clear — no urgent items require attention
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ActionCard
                    icon={<Calendar size={18} />}
                    title="Lease Watch"
                    severity={leaseSev as "red" | "amber" | "green"}
                    lines={leaseLines}
                    href="/tenants"
                  />
                  <ActionCard
                    icon={<ScrollText size={18} />}
                    title="Unpaid Rent"
                    severity={rentSev as "red" | "amber" | "green"}
                    lines={rentLines}
                    href="/income"
                  />
                  <ActionCard
                    icon={<Wrench size={18} />}
                    title="Maintenance"
                    severity={maintSev as "red" | "amber" | "green"}
                    lines={maintLines}
                    href="/maintenance"
                  />
                  <ActionCard
                    icon={<AlertCircle size={18} />}
                    title="Arrears"
                    severity={arrearsSev as "red" | "amber" | "green"}
                    lines={arrearsLines}
                    href="/arrears"
                  />
                </div>
              )}
            </div>

            {/* ── Property Tabs + Rent / Airbnb Table ───────────────────────── */}
            {data.properties?.length > 0 && (
              <Card padding="none">
                <div className="flex border-b border-gray-100 overflow-x-auto">
                  {data.properties.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => setTab(p.id)}
                      className={clsx(
                        "px-5 py-3.5 text-sm font-medium font-sans transition-colors border-b-2 -mb-px whitespace-nowrap",
                        tab === p.id
                          ? "border-gold text-header"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="p-5">
                  {activeProperty?.type === "LONGTERM" ? (
                    <RentStatusTable currency={currency} rows={data.rentStatus.filter((r: any) => r.propertyId === tab)} />
                  ) : (
                    <AlbaRevenueTable currency={currency} rows={data.airbnbRevenue.filter((r: any) => r.propertyId === tab)} />
                  )}
                </div>
              </Card>
            )}

            {/* ── 6-Month Revenue Trend ─────────────────────────────────────── */}
            <Card>
              <h2 className="section-header mb-4">6-Month Revenue Trend</h2>
              {opsLoading ? (
                <div className="flex items-center justify-center py-12"><Spinner size="md" /></div>
              ) : (
                <RevenueChart data={opsData?.trend ?? []} currency={currency} />
              )}
            </Card>

            {/* ── Operations Strip ──────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
              {/* Renewal Pipeline */}
              <Link
                href="/tenants"
                className="flex flex-col items-center justify-center gap-1 bg-white rounded-xl border border-gray-100 shadow-card p-4 hover:shadow-md transition-shadow text-center"
              >
                <RepeatIcon size={18} className="text-gold mb-1" />
                {opsLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <p className={clsx(
                    "font-mono text-2xl font-semibold",
                    (opsData?.renewalPipeline ?? 0) > 0 ? "text-amber-600" : "text-gray-300"
                  )}>
                    {opsData?.renewalPipeline ?? 0}
                  </p>
                )}
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Renewals</p>
                <p className="text-xs text-gray-400 font-sans">in pipeline</p>
              </Link>

              {/* Management Fee */}
              <div className="flex flex-col items-center justify-center gap-1 bg-white rounded-xl border border-gray-100 shadow-card p-4 text-center">
                <DollarSign size={18} className="text-gold mb-1" />
                <CurrencyDisplay
                  currency={currency}
                  amount={Math.abs(data.mgmtFeeReconciliation.balance)}
                  size="md"
                  className={clsx(
                    "font-semibold",
                    data.mgmtFeeReconciliation.balance >= 0 ? "text-income" : "text-expense"
                  )}
                />
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Mgmt Fee</p>
                <p className={clsx(
                  "text-xs font-sans",
                  data.mgmtFeeReconciliation.balance >= 0 ? "text-income" : "text-expense"
                )}>
                  {data.mgmtFeeReconciliation.balance >= 0 ? "settled" : "outstanding"}
                </p>
              </div>

              {/* Vacant Units */}
              <div className="flex flex-col items-center justify-center gap-1 bg-white rounded-xl border border-gray-100 shadow-card p-4 text-center">
                <Building2 size={18} className="text-gold mb-1" />
                {opsLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <p className={clsx(
                    "font-mono text-2xl font-semibold",
                    (opsData?.vacantUnits ?? 0) > 0 ? "text-amber-600" : "text-income"
                  )}>
                    {opsData?.vacantUnits ?? 0}
                  </p>
                )}
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Vacant Units</p>
                <p className="text-xs text-gray-400 font-sans">
                  {(opsData?.vacantUnits ?? 0) === 0 ? "fully occupied" : "need tenants"}
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-sm font-sans text-center py-12">Failed to load data</p>
        )}
      </div>
    </div>
  );
}
