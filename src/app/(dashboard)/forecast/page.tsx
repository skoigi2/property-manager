"use client";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { ForecastChart } from "@/components/forecast/ForecastChart";
import { useProperty } from "@/lib/property-context";
import { formatCurrency } from "@/lib/currency";
import type {
  ForecastResponse,
  ForecastMonth,
  ForecastRisk,
} from "@/types/forecast";

// ── Horizon Toggle ────────────────────────────────────────────────────────────

function HorizonToggle({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5">
      {([3, 6, 12] as const).map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={clsx(
            "px-3 py-1 rounded-md text-sm font-sans transition-colors",
            value === n
              ? "bg-gold text-white"
              : "text-white/60 hover:text-white"
          )}
        >
          {n}mo
        </button>
      ))}
    </div>
  );
}

// ── Month Detail Row ──────────────────────────────────────────────────────────

function MonthDetailRow({
  month,
  expanded,
  onToggle,
}: {
  month: ForecastMonth;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { selected } = useProperty();
  const currency = selected?.currency ?? "KES";
  const net = month.netCashflow;
  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm font-sans text-header font-medium">
          {month.label}
        </td>
        <td className="px-4 py-3 text-right text-sm font-mono text-income">
          {formatCurrency(month.forecastedRent, currency)}
        </td>
        <td className="px-4 py-3 text-right text-sm font-mono text-expense">
          {formatCurrency(month.projectedExpenses, currency)}
        </td>
        <td
          className={clsx(
            "px-4 py-3 text-right text-sm font-mono font-medium",
            net >= 0 ? "text-income" : "text-expense"
          )}
        >
          {formatCurrency(net, currency)}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Toggle details"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={5} className="bg-gray-50 px-4 pb-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Rent breakdown */}
              <div>
                <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Income
                </p>
                <div className="space-y-1">
                  {month.rentBreakdown.map((item) => (
                    <div
                      key={item.tenantId}
                      className="flex items-center justify-between gap-2"
                    >
                      <span
                        className={clsx(
                          "text-xs font-sans truncate",
                          item.isLastMonth
                            ? "text-amber-600"
                            : item.isRenewalProjection
                            ? "text-blue-600"
                            : "text-gray-700"
                        )}
                      >
                        {item.tenantName} · Unit {item.unitNumber}
                        {item.isLastMonth && " (last month)"}
                        {item.isRenewalProjection && " (renewal est.)"}
                      </span>
                      <span className="text-xs font-mono text-income shrink-0">
                        {formatCurrency(item.rent + item.serviceCharge, currency)}
                      </span>
                    </div>
                  ))}
                  {month.rentBreakdown.length === 0 && (
                    <p className="text-xs text-gray-400 font-sans italic">
                      No active leases
                    </p>
                  )}
                </div>
              </div>

              {/* Expense breakdown */}
              <div>
                <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Expenses
                </p>
                <div className="space-y-1">
                  {month.expenseBreakdown.map((item, idx) => (
                    <div
                      key={`${item.sourceId}-${idx}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-sans text-gray-700 truncate">
                        {item.description}
                        {item.propertyName && (
                          <span className="text-gray-400">
                            {" "}
                            · {item.propertyName}
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-mono text-expense shrink-0">
                        {formatCurrency(item.amount, currency)}
                      </span>
                    </div>
                  ))}
                  {month.expenseBreakdown.length === 0 && (
                    <p className="text-xs text-gray-400 font-sans italic">
                      No scheduled expenses
                    </p>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Risk Panel ────────────────────────────────────────────────────────────────

function RiskPanel({ risks }: { risks: ForecastRisk[] }) {
  const leaseExpiries = risks.filter((r) => r.type === "LEASE_EXPIRY");
  const vacancies = risks.filter((r) => r.type === "VACANT_UNIT");
  const insuranceExpiries = risks.filter((r) => r.type === "INSURANCE_EXPIRY");

  if (risks.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-income">
          <TrendingUp size={16} />
          <p className="text-sm font-sans font-medium">
            No risks identified in this forecast window
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {leaseExpiries.length > 0 && (
        <Card padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-500 shrink-0" />
            <p className="text-xs font-sans font-semibold text-gray-700 uppercase tracking-wide">
              Leases Expiring ({leaseExpiries.length})
            </p>
          </div>
          <div className="space-y-2">
            {leaseExpiries.map((r, i) => (
              <p key={i} className="text-xs font-sans text-gray-600">
                {r.message}
              </p>
            ))}
          </div>
        </Card>
      )}

      {vacancies.length > 0 && (
        <Card padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={15} className="text-red-500 shrink-0" />
            <p className="text-xs font-sans font-semibold text-gray-700 uppercase tracking-wide">
              Potential Vacancies ({vacancies.length})
            </p>
          </div>
          <div className="space-y-2">
            {vacancies.map((r, i) => (
              <p key={i} className="text-xs font-sans text-gray-600">
                {r.message}
              </p>
            ))}
          </div>
        </Card>
      )}

      {insuranceExpiries.length > 0 && (
        <Card padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-blue-500 shrink-0" />
            <p className="text-xs font-sans font-semibold text-gray-700 uppercase tracking-wide">
              Insurance Expiring ({insuranceExpiries.length})
            </p>
          </div>
          <div className="space-y-2">
            {insuranceExpiries.map((r, i) => (
              <p key={i} className="text-xs font-sans text-gray-600">
                {r.message}
              </p>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const [horizon, setHorizon] = useState<3 | 6 | 12>(6);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const { selectedId, selected } = useProperty();
  const currency = selected?.currency ?? "KES";

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ months: String(horizon) });
    if (selectedId) params.set("propertyId", selectedId);
    fetch(`/api/forecast?${params}`)
      .then((r) => r.json())
      .then((d: ForecastResponse) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [horizon, selectedId]);

  function toggleMonth(month: string) {
    setExpandedMonth((prev) => (prev === month ? null : month));
  }

  return (
    <>
      <Header title="Cashflow Forecast">
        <HorizonToggle value={horizon} onChange={(n) => setHorizon(n as 3 | 6 | 12)} />
      </Header>

      <div className="page-container space-y-6">
        {/* Airbnb note */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs font-sans text-blue-700">
            Airbnb short-let units are excluded from rent projections — booking
            revenue cannot be reliably forecast from lease data. Only long-term
            tenancies are modelled.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!loading && data && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <p className="text-xs font-sans text-gray-500 mb-1">
                  Forecasted Income
                </p>
                <CurrencyDisplay
                  amount={data.summary.totalForecastedRent}
                  size="xl"
                  className="text-income"
                />
                <p className="text-xs text-gray-400 font-sans mt-1">
                  Over {data.horizon} months
                </p>
              </Card>

              <Card>
                <p className="text-xs font-sans text-gray-500 mb-1">
                  Projected Expenses
                </p>
                <CurrencyDisplay
                  amount={data.summary.totalProjectedExpenses}
                  size="xl"
                  className="text-expense"
                />
                <p className="text-xs text-gray-400 font-sans mt-1">
                  Recurring + insurance + management fees
                </p>
              </Card>

              <Card>
                <p className="text-xs font-sans text-gray-500 mb-1">
                  Net Cashflow
                </p>
                <CurrencyDisplay
                  amount={data.summary.totalNetCashflow}
                  size="xl"
                  colorize
                />
                <p className="text-xs text-gray-400 font-sans mt-1">
                  {data.summary.expiringLeaseCount > 0
                    ? `${data.summary.expiringLeaseCount} lease${data.summary.expiringLeaseCount > 1 ? "s" : ""} expiring`
                    : "No leases expiring in window"}
                </p>
              </Card>
            </div>

            {/* Chart */}
            <Card>
              <h2 className="text-sm font-sans font-semibold text-header mb-4">
                Monthly Cashflow Projection
              </h2>
              <ForecastChart months={data.months} currency={currency} />
            </Card>

            {/* Month-by-month table */}
            <Card padding="none">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">
                        Month
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">
                        Income
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">
                        Expenses
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">
                        Net
                      </th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((month) => (
                      <MonthDetailRow
                        key={month.month}
                        month={month}
                        expanded={expandedMonth === month.month}
                        onToggle={() => toggleMonth(month.month)}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-3 text-sm font-sans font-semibold text-header">
                        Total
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-income">
                        {formatCurrency(data.summary.totalForecastedRent, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-expense">
                        {formatCurrency(data.summary.totalProjectedExpenses, currency)}
                      </td>
                      <td
                        className={clsx(
                          "px-4 py-3 text-right text-sm font-mono font-semibold",
                          data.summary.totalNetCashflow >= 0
                            ? "text-income"
                            : "text-expense"
                        )}
                      >
                        {formatCurrency(data.summary.totalNetCashflow, currency)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            {/* Risks */}
            <div>
              <h2 className="text-sm font-sans font-semibold text-header mb-3">
                Risks in Forecast Window
              </h2>
              <RiskPanel risks={data.risks} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
