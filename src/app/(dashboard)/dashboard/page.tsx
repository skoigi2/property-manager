"use client";
import { useState, useEffect } from "react";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { KPICard } from "@/components/dashboard/KPICard";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { RentStatusTable } from "@/components/dashboard/RentStatusTable";
import { AlbaRevenueTable } from "@/components/dashboard/AlbaRevenueTable";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Header } from "@/components/layout/Header";
import { TrendingUp, Receipt, DollarSign, Wallet } from "lucide-react";
import { useSession } from "next-auth/react";
import { useProperty } from "@/lib/property-context";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { selectedId } = useProperty();
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      year: String(month.getFullYear()),
      month: String(month.getMonth() + 1),
    });
    if (selectedId) params.set("propertyId", selectedId);

    fetch(`/api/dashboard?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        // Default tab to first property in result
        if (d.properties?.length > 0) {
          setTab((prev) => prev ?? d.properties[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

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
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label="Gross Income" amount={data.kpis.totalGrossIncome} type="income" icon={<TrendingUp size={18} />} />
              <KPICard label="Commissions" amount={data.kpis.totalCommissions} type="expense" icon={<DollarSign size={18} />} />
              <KPICard label="Total Expenses" amount={data.kpis.totalExpenses} type="expense" icon={<Receipt size={18} />} />
              <KPICard label="Net Profit" amount={data.kpis.netProfit} type="balance" icon={<Wallet size={18} />} />
            </div>

            {/* Alerts */}
            <Card>
              <h2 className="section-header mb-4">Alerts</h2>
              <AlertsPanel
                leaseAlerts={data.alerts.leaseAlerts}
                noRentAlerts={data.alerts.noRentAlerts}
                noIncomeAlerts={data.alerts.noIncomeAlerts}
                pettyCashDeficit={data.alerts.pettyCashDeficit}
                pettyCashBalance={data.kpis.pettyCashBalance}
                mgmtFeeBalance={data.mgmtFeeReconciliation.balance}
              />
            </Card>

            {/* Property Tabs */}
            {data.properties?.length > 0 && (
              <Card padding="none">
                <div className="flex border-b border-gray-100 overflow-x-auto">
                  {data.properties.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => setTab(p.id)}
                      className={`px-5 py-3.5 text-sm font-medium font-sans transition-colors border-b-2 -mb-px whitespace-nowrap ${
                        tab === p.id
                          ? "border-gold text-header"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="p-5">
                  {activeProperty?.type === "LONGTERM" ? (
                    <RentStatusTable
                      rows={data.rentStatus.filter((r: any) => r.propertyId === tab)}
                    />
                  ) : (
                    <AlbaRevenueTable
                      rows={data.airbnbRevenue.filter((r: any) => r.propertyId === tab)}
                    />
                  )}
                </div>
              </Card>
            )}

            {/* Revenue Chart */}
            <Card>
              <h2 className="section-header mb-4">6-Month Revenue Trend</h2>
              <RevenueChart data={data.trend} />
            </Card>

            {/* Management Fee Reconciliation */}
            <Card>
              <h2 className="section-header mb-3">Management Fee Reconciliation</h2>
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: "Fees Owing", amount: data.mgmtFeeReconciliation.owing, color: "text-expense" },
                  { label: "Fees Paid", amount: data.mgmtFeeReconciliation.paid, color: "text-income" },
                  { label: "Balance", amount: data.mgmtFeeReconciliation.balance, color: data.mgmtFeeReconciliation.balance >= 0 ? "text-income" : "text-expense" },
                ].map((item) => (
                  <div key={item.label} className="flex-1 min-w-[100px] bg-cream rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 font-sans uppercase tracking-wide mb-1">{item.label}</p>
                    <p className={`font-mono text-base font-medium ${item.color}`}>KSh {item.amount.toLocaleString("en-KE", { maximumFractionDigits: 0 })}</p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        ) : (
          <p className="text-gray-400 text-sm font-sans text-center py-12">Failed to load data</p>
        )}
      </div>
    </div>
  );
}
