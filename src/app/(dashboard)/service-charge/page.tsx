"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { Calculator, ChevronLeft, ChevronRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useProperty } from "@/lib/property-context";
import { readApiError } from "@/lib/api-error";
import { BASIS_LABEL, type ServiceChargeBasisValue } from "@/lib/service-charge";
import type { ServiceChargeView } from "@/lib/service-charge-data";
import { BudgetTab } from "@/components/service-charge/BudgetTab";
import { ActualsTab } from "@/components/service-charge/ActualsTab";
import { YearEndTab } from "@/components/service-charge/YearEndTab";
import { TutorialVideo } from "@/components/ui/TutorialVideo";

type Tab = "budget" | "actuals" | "statement";
const TAB_KEY = "gw:serviceChargeTab";
type BudgetSummary = { id: string; year: number; startMonth: number; basis: string; publishedAt: string | null; total: number };

/**
 * Service charge for apartment blocks: the year's budget per cost, how it
 * compares with what has been spent, and the year-end statement that settles
 * each tenant's share against what they were billed.
 */
export default function ServiceChargePage() {
  const { data: session } = useSession();
  const orgRole = (session?.user as { orgRole?: string } | undefined)?.orgRole;
  const { selectedId, setSelectedId, selected, properties, loading: propsLoading } = useProperty();
  const longTerm = properties.filter((p) => p.type === "LONGTERM");
  const propertyId = selected?.type === "LONGTERM" ? selectedId : null;

  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTabState] = useState<Tab>("budget");
  const [budgets, setBudgets] = useState<BudgetSummary[] | null>(null);
  const [view, setView] = useState<ServiceChargeView | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBasis, setNewBasis] = useState<ServiceChargeBasisValue>("FLOOR_AREA");

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(TAB_KEY);
      if (t === "budget" || t === "actuals" || t === "statement") setTabState(t);
    } catch { /* ignore */ }
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    try { sessionStorage.setItem(TAB_KEY, t); } catch { /* ignore */ }
  };

  const loadBudgets = useCallback(async () => {
    if (!propertyId) return;
    const res = await fetch(`/api/service-charge/budgets?propertyId=${propertyId}`);
    setBudgets(res.ok ? await res.json() : []);
  }, [propertyId]);

  useEffect(() => { setBudgets(null); setView(null); loadBudgets(); }, [loadBudgets]);

  const current = budgets?.find((b) => b.year === year) ?? null;

  const loadView = useCallback(async () => {
    if (!current) { setView(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/service-charge/budgets/${current.id}`);
      if (!res.ok) throw new Error(await readApiError(res, "Failed to load the budget"));
      setView(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load the budget");
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => { loadView(); }, [loadView]);

  async function create(copyPrevious: boolean) {
    if (!propertyId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/service-charge/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, year, basis: newBasis, copyPrevious }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not create the budget"));
      toast.success(`${year} budget created`);
      setTab("budget");
      await loadBudgets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the budget");
    } finally {
      setCreating(false);
    }
  }

  const refresh = async () => { await loadBudgets(); await loadView(); };
  const previous = budgets?.filter((b) => b.year < year).sort((a, b) => b.year - a.year)[0] ?? null;

  return (
    <div>
      <Header title="Service Charge" userName={session?.user?.name ?? session?.user?.email} role={orgRole} />
      <div className="page-container space-y-4 pb-24 lg:pb-8">
        {!propertyId ? (
          <Card>
            <EmptyState
              icon={<Calculator size={28} />}
              title="Pick an apartment block"
              description="Service charge budgets are set one long-term property at a time."
              action={
                propsLoading ? <Spinner /> : longTerm.length === 0 ? undefined : (
                  <div className="flex flex-wrap justify-center gap-2">
                    {longTerm.map((p) => (
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1">
                <button type="button" onClick={() => setYear((y) => y - 1)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Previous year"><ChevronLeft size={16} /></button>
                <span className="text-body font-medium text-gray-900 tabular-nums w-12 text-center">{year}</span>
                <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year > new Date().getFullYear()} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="Next year"><ChevronRight size={16} /></button>
              </div>
              {view && <span className="text-caption text-gray-500">{selected?.name} · service charge year {view.period.label}</span>}
            </div>

            {budgets === null || loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : !current ? (
              <Card>
                <EmptyState
                  icon={<Calculator size={28} />}
                  title={`No ${year} service charge budget`}
                  description="Set the year's budget for the block's shared costs — security, cleaning, garbage, gardens, lift, generator — then compare it with what is spent and settle each tenant's share at year end."
                  action={
                    <div className="flex flex-col items-center gap-3">
                      <label className="flex items-center gap-2 text-body text-gray-600">
                        Split between units by
                        <select
                          value={newBasis}
                          onChange={(e) => setNewBasis(e.target.value as ServiceChargeBasisValue)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-body bg-white"
                        >
                          {(Object.keys(BASIS_LABEL) as ServiceChargeBasisValue[]).map((b) => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
                        </select>
                      </label>
                      <div className="flex flex-wrap justify-center gap-2">
                        {previous && (
                          <Button onClick={() => create(true)} loading={creating}>Start from the {previous.year} budget</Button>
                        )}
                        <Button variant={previous ? "secondary" : "primary"} onClick={() => create(false)} loading={creating}>
                          Create a blank {year} budget
                        </Button>
                      </div>
                    </div>
                  }
                />
              </Card>
            ) : view ? (
              <>
                <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
                  {([["budget", "Budget"], ["actuals", "Budget vs actual"], ["statement", "Year-end statement"]] as [Tab, string][]).map(([key, text]) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={clsx(
                        "px-4 py-2 text-body font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
                        tab === key ? "border-gold text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700",
                      )}
                    >
                      {text}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center pl-3 shrink-0">
                    <TutorialVideo tutorialKey="service-charge" variant="link" />
                  </div>
                </div>
                {tab === "budget" ? (
                  <BudgetTab view={view} onChanged={refresh} onDeleted={async () => { setView(null); await loadBudgets(); }} />
                ) : tab === "actuals" ? (
                  <ActualsTab view={view} />
                ) : (
                  <YearEndTab view={view} onChanged={refresh} />
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
