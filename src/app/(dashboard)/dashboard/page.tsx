"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { KPICard } from "@/components/dashboard/KPICard";
import { SetupChecklist } from "@/components/dashboard/SetupChecklist";
import { WelcomeTour } from "@/components/dashboard/WelcomeTour";
import { RentStatusTable } from "@/components/dashboard/RentStatusTable";
import { AlbaRevenueTable } from "@/components/dashboard/AlbaRevenueTable";
import { Header } from "@/components/layout/Header";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { useSharedMonth } from "@/lib/use-shared-month";
import { TbcDateFix } from "@/components/tenants/TbcDateFix";

// recharts is ~200 KB gzipped — keep it out of the initial dashboard chunk so
// the KPI cards render before the chart bundle is parsed.
const RevenueChart = dynamic(
  () => import("@/components/dashboard/RevenueChart").then((m) => m.RevenueChart),
  { ssr: false, loading: () => <div className="h-72 bg-gray-50 rounded-xl animate-pulse" /> },
);
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

interface ActionCardItem {
  key: string;
  label: string;
  /** Per-item deep link (e.g. a tenant's Renewal tab). */
  href?: string;
  /** Inline atomic action (e.g. the TBC lease-end date fix). */
  inline?: React.ReactNode;
}

function ActionCard({ icon, title, severity, lines, href, items }: {
  icon: React.ReactNode;
  title: string;
  severity: "red" | "amber" | "green";
  lines: string[];
  href: string;
  items?: ActionCardItem[];
}) {
  const c = {
    red:   { border: "border-red-200",   bg: "bg-red-50/50",   iconColor: "text-red-500",   chevron: "text-red-300"   },
    amber: { border: "border-amber-200", bg: "bg-amber-50/50", iconColor: "text-amber-500", chevron: "text-amber-300" },
    green: { border: "border-green-100", bg: "bg-green-50/30", iconColor: "text-green-500", chevron: "text-green-300" },
  }[severity];

  // The card header is the section link; per-item rows carry their own deep
  // links / inline actions, so the card can't be one big <Link> anymore.
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} hover:shadow-sm transition-shadow`}>
      <Link href={href} className="flex items-start gap-3 p-4">
        <div className={`shrink-0 mt-0.5 ${c.iconColor}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className=" font-semibold text-body text-header">{title}</p>
          {lines.map((line, i) => (
            <p key={i} className="text-caption text-gray-500 mt-0.5 ">{line}</p>
          ))}
        </div>
        <ChevronRight size={14} className={`${c.chevron} shrink-0 mt-1`} />
      </Link>
      {items && items.length > 0 && (
        <div className="border-t border-black/5 px-4 py-2 space-y-1.5">
          {items.map((it) => (
            <div key={it.key} className="flex items-center justify-between gap-2 flex-wrap">
              {it.href ? (
                <Link
                  href={it.href}
                  className="text-caption text-gray-600 hover:text-header hover:underline underline-offset-2 truncate min-w-0"
                >
                  {it.label}
                </Link>
              ) : (
                <span className="text-caption text-gray-600 truncate min-w-0">{it.label}</span>
              )}
              {it.inline}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session } = useSession();
  const { selectedId, selected } = useProperty();
  const currency = useProperty().currency;
  const [month, setMonth] = useSharedMonth();
  const [tab, setTab] = useState<string | null>(null);

  const params = new URLSearchParams({
    year: String(month.getFullYear()),
    month: String(month.getMonth() + 1),
  });
  if (selectedId) params.set("propertyId", selectedId);

  // Cache key reflects every input that affects the result — month + property
  // scope. Switching either reads a different cache slot, so going back to a
  // previously-visited combination is instant.
  const cacheScope = `${month.getFullYear()}-${month.getMonth() + 1}:${selectedId ?? "all"}`;
  const { data, setData, loading, error, refresh } = useCachedFetch<any>(`dashboard:${cacheScope}`, `/api/dashboard?${params}`);
  const { data: opsData, loading: opsLoading } = useCachedFetch<any>(`dashboard-ops:${cacheScope}`, `/api/dashboard/ops?${params}`);

  // Portfolio mode gets a combined "All properties" pseudo-tab (default) ahead
  // of the per-property tabs, so managers see the whole rent picture at once.
  const ALL_TAB = "__all__";
  const isPortfolio = !selectedId && (data?.properties?.length ?? 0) > 1;

  // Reset tab when properties change
  useEffect(() => {
    if (data?.properties?.length > 0) {
      const ids = data.properties.map((p: any) => p.id);
      const portfolio = !selectedId && ids.length > 1;
      const valid = portfolio ? [ALL_TAB, ...ids] : ids;
      if (!valid.includes(tab)) setTab(portfolio ? ALL_TAB : ids[0]);
    }
  }, [data?.properties, tab, selectedId]);

  const activeProperty = data?.properties?.find((p: any) => p.id === tab);

  const propertyNameById = new Map<string, string>(
    (data?.properties ?? []).map((p: any) => [p.id, p.name]),
  );
  const withPropertyName = (rows: any[]) =>
    rows.map((r) => ({ ...r, propertyName: propertyNameById.get(r.propertyId) }));

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

  const ledgerArrearsCount = data?.alerts?.arrearsAlerts?.length ?? 0;
  const leaseSev   = criticalLeases > 0 ? "red" : (warningLeases > 0 || tbcLeases > 0) ? "amber" : "green";
  const rentSev    = (noRentCount > 0 || invSum.count > 0) ? "amber" : "green";
  const maintSev   = maint.urgent > 0 ? "red" : (maint.high > 0 || maint.open > 0) ? "amber" : "green";
  // Ledger debtors (multi-period arrears without an opened case) count too —
  // otherwise the card sits green while tenants owe months of rent.
  const arrearsSev = arrears.escalated > 0 ? "red" : (arrears.openCases > 0 || ledgerArrearsCount > 0) ? "amber" : "green";
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

  const arrearsLines = arrears.openCases === 0 && ledgerArrearsCount === 0
    ? ["No active arrears cases"]
    : [
        ...(arrears.openCases > 0 ? [`${arrears.openCases} active case${arrears.openCases > 1 ? "s" : ""}`] : []),
        ...(ledgerArrearsCount > 0 ? [`${ledgerArrearsCount} tenant${ledgerArrearsCount > 1 ? "s" : ""} in multi-period arrears`] : []),
        ...(arrears.escalated > 0 ? [`${arrears.escalated} escalated to legal/eviction`] : []),
        ...(arrears.totalOwed > 0 ? [`${formatCurrency(arrears.totalOwed, currency)} total owed`] : []),
      ];

  // Per-item rows under the cards: each lease alert deep-links to the
  // tenant's Renewal tab; TBC rows get the inline lease-end fix (removing the
  // row from the cached alert list on save, no refetch needed).
  const ITEM_CAP = 5;
  const leaseAlertList: any[] = data?.alerts?.leaseAlerts ?? [];
  const sortedLeaseAlerts = [...leaseAlertList].sort((a, b) => {
    const rank = (s: string) => (s === "CRITICAL" ? 0 : s === "TBC" ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });
  const leaseItems: any[] = sortedLeaseAlerts.slice(0, ITEM_CAP).map((a: any) => ({
    key: `${a.tenantId}-${a.unitNumber}`,
    label: `${a.tenantName} (${a.unitNumber}) — ${
      a.status === "TBC" ? "no end date" : a.status === "CRITICAL" ? "expired" : `${a.days}d left`
    }`,
    ...(a.status === "TBC"
      ? {
          inline: (
            <TbcDateFix
              tenantId={a.tenantId}
              onSaved={() =>
                setData((prev: any) =>
                  prev
                    ? {
                        ...prev,
                        alerts: {
                          ...prev.alerts,
                          leaseAlerts: (prev.alerts?.leaseAlerts ?? []).filter(
                            (x: any) => x.tenantId !== a.tenantId,
                          ),
                        },
                      }
                    : prev,
                )
              }
            />
          ),
        }
      : { href: `/tenants/${a.tenantId}?tab=renewal` }),
  }));
  if (sortedLeaseAlerts.length > ITEM_CAP) {
    leaseItems.push({
      key: "lease-more",
      label: `+${sortedLeaseAlerts.length - ITEM_CAP} more…`,
      href: "/tenants",
    });
  }

  // Ledger arrears (multi-period debtors) deep-link into the Income page's
  // Arrears view; the card header keeps linking to /arrears (cases).
  const arrearsAlertList: any[] = data?.alerts?.arrearsAlerts ?? [];
  const arrearsItems: any[] = arrearsAlertList.slice(0, ITEM_CAP).map((a: any) => ({
    key: a.tenantId,
    label: `${a.tenantName} (${a.unitNumber}) — ${a.monthsUnpaid}mo · ${formatCurrency(a.totalArrears, currency)}`,
    href: "/income?view=arrears",
  }));
  if (arrearsAlertList.length > ITEM_CAP) {
    arrearsItems.push({
      key: "arrears-more",
      label: `+${arrearsAlertList.length - ITEM_CAP} more…`,
      href: "/income?view=arrears",
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <Header
        title="Dashboard"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      />

      <div className="page-container space-y-6">
        {session?.user?.orgRole !== "OWNER" && <WelcomeTour />}
        {selectedId && session?.user?.orgRole !== "OWNER" && (
          <SetupChecklist propertyId={selectedId} />
        )}

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
          {data?.generatedAt && (
            <span
              className="ml-auto text-caption text-gray-400 "
              title="When these numbers were computed — the app may briefly serve cached data while refreshing"
            >
              Updated{" "}
              {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {error && data && (
            <button
              onClick={() => refresh()}
              title="The last background refresh failed — these numbers may be stale. Click to retry."
              className="flex items-center gap-1 text-caption text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors"
            >
              ⚠ Refresh failed — retry
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
                tooltip="Total rent and charges collected this period, before any deductions. This is your top-line revenue."
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
                tooltip="What's left after agent commissions and all operating expenses. A healthy property typically returns 30–50% margin."
              />
              <KPICard
                currency={currency}
                label="Outstanding"
                amount={invSum.amount}
                type={invSum.amount > 0 ? "neutral" : "income"}
                icon={<Receipt size={18} />}
                subtext={invSum.count > 0 ? `${invSum.count} invoice${invSum.count > 1 ? "s" : ""}` : "All invoices paid"}
                tooltip="Invoices sent to tenants that haven't been paid yet. Chasing these promptly keeps your cash flow healthy."
              />
              <KPICard
                currency={currency}
                label="Arrears Owed"
                amount={arrears.totalOwed}
                type={arrears.totalOwed > 0 ? "expense" : "income"}
                icon={<AlertTriangle size={18} />}
                subtext={arrears.openCases > 0 ? `${arrears.openCases} open case${arrears.openCases > 1 ? "s" : ""}` : "No active cases"}
                tooltip="Rent your tenants owe that's overdue. Early action — a call or reminder — prevents this from escalating."
              />
              <KPICard
                currency={currency}
                label="Petty Cash"
                amount={data.kpis.pettyCashBalance}
                type="balance"
                icon={<DollarSign size={18} />}
                subtext="Current balance"
                tooltip="Cash on hand for small day-to-day costs like supplies or minor repairs. Top up when it runs low to avoid delays."
              />
            </div>

            {/* ── Attention Required ────────────────────────────────────────── */}
            <div>
              <h2 className="section-header mb-3">Attention Required</h2>
              {allClear ? (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <CheckCircle size={18} className="text-green-500 shrink-0" />
                  <p className="text-body text-green-700 font-medium">
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
                    items={leaseItems}
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
                    items={arrearsItems}
                  />
                </div>
              )}
            </div>

            {/* ── Property Tabs + Rent / Airbnb Table ───────────────────────── */}
            {data.properties?.length > 0 && (
              <Card padding="none">
                <div className="flex border-b border-gray-100 overflow-x-auto">
                  {isPortfolio && (
                    <button
                      onClick={() => setTab(ALL_TAB)}
                      className={clsx(
                        "px-5 py-3.5 text-body font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                        tab === ALL_TAB
                          ? "border-gold text-header"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      )}
                    >
                      All properties
                    </button>
                  )}
                  {data.properties.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => setTab(p.id)}
                      className={clsx(
                        "px-5 py-3.5 text-body font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                        tab === p.id
                          ? "border-gold text-header"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="p-5 space-y-6">
                  {tab === ALL_TAB ? (
                    <>
                      {data.rentStatus?.length > 0 && (
                        <div>
                          <h3 className="text-label font-medium text-gray-400 uppercase mb-3">Long-term rent</h3>
                          <RentStatusTable currency={currency} showProperty rows={withPropertyName(data.rentStatus)} />
                        </div>
                      )}
                      {data.airbnbRevenue?.length > 0 && (
                        <div>
                          <h3 className="text-label font-medium text-gray-400 uppercase mb-3">Short-let revenue</h3>
                          <AlbaRevenueTable currency={currency} showProperty rows={withPropertyName(data.airbnbRevenue)} />
                        </div>
                      )}
                      {!(data.rentStatus?.length > 0) && !(data.airbnbRevenue?.length > 0) && (
                        <p className="text-body text-gray-400 text-center py-6">No unit data for this month</p>
                      )}
                    </>
                  ) : activeProperty?.type === "LONGTERM" ? (
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
            {/* Mgmt Fee tile only renders when a fee is actually in play —
                a no-fee org/period would just show a meaningless "KSh 0". */}
            <div
              className={clsx(
                "grid gap-3",
                data.mgmtFeeReconciliation.owing > 0 || data.mgmtFeeReconciliation.paid > 0
                  ? "grid-cols-3"
                  : "grid-cols-2",
              )}
            >
              {/* Renewal Pipeline */}
              <Link
                href="/tenants?filter=renewals"
                className="flex flex-col items-center justify-center gap-1 bg-white rounded-xl border border-gray-100 shadow-card p-4 hover:shadow-md transition-shadow text-center"
              >
                <RepeatIcon size={18} className="text-gold mb-1" />
                {opsLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <p className={clsx(
                    "tabular-nums text-h1 ",
                    (opsData?.renewalPipeline ?? 0) > 0 ? "text-amber-600" : "text-gray-300"
                  )}>
                    {opsData?.renewalPipeline ?? 0}
                  </p>
                )}
                <p className="text-label text-gray-400 uppercase ">Renewals</p>
                <p className="text-caption text-gray-400 ">in pipeline</p>
              </Link>

              {/* Management Fee — links to Expenses (where the fee payment is
                  logged); hidden entirely when no fee is configured/paid */}
              {(data.mgmtFeeReconciliation.owing > 0 || data.mgmtFeeReconciliation.paid > 0) && (
              <Link
                href="/expenses"
                title={`Owing ${formatCurrency(data.mgmtFeeReconciliation.owing, currency)} · Paid ${formatCurrency(data.mgmtFeeReconciliation.paid, currency)}`}
                className="flex flex-col items-center justify-center gap-1 bg-white rounded-xl border border-gray-100 shadow-card p-4 hover:shadow-md transition-shadow text-center"
              >
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
                <p className="text-label text-gray-400 uppercase ">Mgmt Fee</p>
                <p className={clsx(
                  "text-caption ",
                  data.mgmtFeeReconciliation.balance >= 0 ? "text-income" : "text-expense"
                )}>
                  {data.mgmtFeeReconciliation.balance >= 0 ? "settled" : "outstanding"}
                </p>
              </Link>
              )}

              {/* Vacant Units — one click from the count to the Add Tenant
                  form (which lists exactly the vacant/listed units) */}
              <Link
                href="/tenants?add=1"
                className="flex flex-col items-center justify-center gap-1 bg-white rounded-xl border border-gray-100 shadow-card p-4 hover:shadow-md transition-shadow text-center"
              >
                <Building2 size={18} className="text-gold mb-1" />
                {opsLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <p className={clsx(
                    "tabular-nums text-h1 ",
                    (opsData?.vacantUnits ?? 0) > 0 ? "text-amber-600" : "text-income"
                  )}>
                    {opsData?.vacantUnits ?? 0}
                  </p>
                )}
                <p className="text-label text-gray-400 uppercase ">Vacant Units</p>
                <p className="text-caption text-gray-400 ">
                  {(opsData?.vacantUnits ?? 0) === 0 ? "fully occupied" : "need tenants"}
                </p>
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-gray-400 text-body ">Couldn&apos;t load the dashboard — check your connection.</p>
            <button
              onClick={() => refresh()}
              className="flex items-center gap-1.5 px-4 py-2 bg-gold text-white text-body font-medium rounded-lg hover:bg-gold-dark transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
