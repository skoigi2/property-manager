"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { Gauge } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Spinner } from "@/components/ui/Spinner";
import { useProperty } from "@/lib/property-context";
import { useSharedMonth } from "@/lib/use-shared-month";
import { ReadingsTab } from "@/components/utilities/ReadingsTab";
import { ReviewTab } from "@/components/utilities/ReviewTab";
import { MetersTariffsTab } from "@/components/utilities/MetersTariffsTab";
import { StatementTab } from "@/components/utilities/StatementTab";
import { ReconciliationTab } from "@/components/utilities/ReconciliationTab";
import type { ReadingSheet } from "@/components/utilities/types";

type Tab = "readings" | "review" | "statement" | "reconciliation" | "setup";
const TAB_KEY = "gw:utilitiesTab";

/**
 * Water & electricity metering. The caretaker reads every meter at month end
 * (Readings); a manager checks the numbers against the photos and approves
 * (Review & bill); approved readings are billed with the rent on next month's
 * invoices. Rates and meters live under Meters & tariffs.
 */
export default function UtilitiesPage() {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; orgRole?: string; role?: string; organizationId?: string | null } | undefined;
  const orgRole = user?.orgRole;
  const superAdmin = user?.role === "ADMIN" && user?.organizationId == null;
  const isManager = superAdmin || ["ADMIN", "MANAGER", "ACCOUNTANT"].includes(orgRole ?? "");
  const canEditRates = superAdmin || ["ADMIN", "MANAGER"].includes(orgRole ?? "");

  const { selectedId, setSelectedId, selected, properties, currency, loading: propsLoading } = useProperty();
  const [month, setMonth] = useSharedMonth();
  const [tab, setTabState] = useState<Tab>("readings");
  const [sheet, setSheet] = useState<ReadingSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  const year = month.getFullYear();
  const monthNumber = month.getMonth() + 1;
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Deep links (Inbox rows): ?tab=review&propertyId=…&month=previous win
  // over the remembered tab; otherwise restore the last tab used.
  useEffect(() => {
    const isTab = (v: string | null): v is Tab =>
      v === "readings" || v === "review" || v === "statement" || v === "reconciliation" || v === "setup";
    try {
      const qs = new URLSearchParams(window.location.search);
      const linkedProperty = qs.get("propertyId");
      if (linkedProperty) setSelectedId(linkedProperty);
      if (qs.get("month") === "previous") {
        const now = new Date();
        setMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      }
      const linkedTab = qs.get("tab");
      if (isTab(linkedTab)) {
        setTabState(linkedTab);
        return;
      }
      const stored = sessionStorage.getItem(TAB_KEY);
      if (isTab(stored)) setTabState(stored);
    } catch { /* sessionStorage unavailable */ }
    // Run once on mount — the query string is read, never written back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    try { sessionStorage.setItem(TAB_KEY, t); } catch { /* ignore */ }
  };
  // A caretaker only ever has the Readings tab.
  const activeTab: Tab = isManager ? tab : "readings";

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/utilities/readings?propertyId=${selectedId}&year=${year}&month=${monthNumber}`);
      if (!res.ok) throw new Error();
      setSheet(await res.json());
    } catch {
      toast.error("Failed to load the meter readings");
    } finally {
      setLoading(false);
    }
  }, [selectedId, year, monthNumber]);

  useEffect(() => {
    setSheet(null);
    load();
  }, [load]);

  // The Kilimani Court sample property seeded before metering existed has no
  // meters: offer its sample meters, readings and bills in one click.
  const canLoadSample = isManager && selected?.name === "Kilimani Court" && !!sheet && sheet.rows.length === 0;
  async function loadSample() {
    setLoadingSample(true);
    try {
      const res = await fetch("/api/demo/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoKey: "kilimani-court", organizationId: user?.organizationId ?? undefined }),
      });
      const body = await res.json().catch(() => null);
      if (body?.utilitiesAdded) toast.success("Sample meters, readings and bills loaded");
      else toast.error(body?.error ?? "The sample data could not be loaded for this property.");
      await load();
    } finally {
      setLoadingSample(false);
    }
  }

  const tabs: [Tab, string][] = [
    ["readings", "Readings"],
    ["review", "Review & bill"],
    ["statement", "Paid & unpaid"],
    ["reconciliation", "Reconciliation"],
    ["setup", "Meters & tariffs"],
  ];
  const awaiting = sheet?.rows.filter((r) => r.reading?.status === "SUBMITTED").length ?? 0;

  return (
    <div>
      <Header title="Utilities" userName={session?.user?.name ?? session?.user?.email} role={orgRole}>
        {(activeTab === "readings" || activeTab === "review") && <MonthPicker value={month} onChange={setMonth} max={new Date()} />}
      </Header>

      <div className="page-container space-y-4 pb-24 lg:pb-8">
        {!selectedId ? (
          <Card>
            <EmptyState
              icon={<Gauge size={28} />}
              title="Pick a property"
              description="Meters are read one property at a time."
              action={
                propsLoading ? <Spinner /> : (
                  <div className="flex flex-wrap justify-center gap-2">
                    {properties.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-body text-gray-700 hover:border-gold hover:text-gold-dark transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )
              }
            />
          </Card>
        ) : (
          <>
            {isManager && (
              <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
                {tabs.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={clsx(
                      "px-4 py-2 text-body font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
                      activeTab === key ? "border-gold text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700",
                    )}
                  >
                    {label}
                    {key === "review" && awaiting > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-caption px-1.5 leading-none py-0.5">{awaiting}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {canLoadSample && (
              <Card padding="sm" className="border border-gold/40 bg-gold/5">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-body text-gray-700 flex-1 min-w-[14rem]">
                    This sample property has no meters yet. Load sample water and electricity meters, three months of readings billed on
                    its invoices, and the council, KPLC and generator costs — to see metering working end to end.
                  </p>
                  <Button size="sm" onClick={loadSample} loading={loadingSample}>Load sample meters &amp; readings</Button>
                </div>
              </Card>
            )}

            {activeTab === "statement" ? (
              <StatementTab propertyId={selectedId} currency={currency} />
            ) : activeTab === "reconciliation" ? (
              <ReconciliationTab propertyId={selectedId} currency={currency} />
            ) : activeTab === "setup" ? (
              <MetersTariffsTab propertyId={selectedId} currency={currency} canEditRates={canEditRates} onChanged={load} />
            ) : loading && !sheet ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : !sheet ? null : activeTab === "readings" ? (
              <ReadingsTab
                sheet={sheet}
                year={year}
                month={monthNumber}
                monthLabel={monthLabel}
                userId={user?.id ?? null}
                isManager={isManager}
                onSaved={load}
              />
            ) : (
              <ReviewTab
                sheet={sheet}
                propertyId={selectedId}
                year={year}
                month={monthNumber}
                monthLabel={monthLabel}
                currency={currency}
                onChanged={load}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
