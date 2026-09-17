"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HelpTip } from "@/components/ui/HelpTip";
import { Spinner } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/currency";
import { exportUtilityReconciliation } from "@/lib/excel-export";
import type { UtilityReconRow } from "@/lib/utility-reconciliation";
import { readError } from "./types";

interface ReconBlock {
  rows: UtilityReconRow[];
  total: UtilityReconRow;
  tariff: { supplyRate: number; fuelRate: number; ratePerUnit: number } | null;
}
interface ReconResponse {
  property: { name: string; currency: string };
  year: number;
  water: ReconBlock;
  electricity: ReconBlock;
  untaggedCollected: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 3 }));

/**
 * Where the water and electricity money goes: what tenants were billed and
 * paid, what went to the council / KPLC and on generator fuel, and the
 * surplus that belongs to the owner.
 */
export function ReconciliationTab({ propertyId, currency }: { propertyId: string; currency: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<ReconResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/utilities/reconciliation?propertyId=${propertyId}&year=${year}`);
      if (!res.ok) throw new Error(await readError(res, "Failed to load the reconciliation"));
      setData(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load the reconciliation");
    } finally {
      setLoading(false);
    }
  }, [propertyId, year]);

  useEffect(() => { load(); }, [load]);

  const cur = data?.property.currency ?? currency;
  const fmt = (n: number) => formatCurrency(n, cur);

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setYear((y) => y - 1)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Previous year"><ChevronLeft size={16} /></button>
            <span className="text-body font-medium text-gray-900 tabular-nums w-12 text-center">{year}</span>
            <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year >= new Date().getFullYear()} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="Next year"><ChevronRight size={16} /></button>
          </div>
          <p className="text-caption text-gray-500 flex-1 min-w-[12rem]">
            Billed follows the month the meter was read. Collected and paid follow the date the money moved, so look at the year-to-date row
            for the true position. Costs come from the{" "}
            <Link href="/expenses" className="text-gold-dark hover:underline">Expenses</Link> page: Water (council), Electricity (KPLC) and Generator (fuel).
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={!data}
            onClick={() => data && exportUtilityReconciliation({ propertyName: data.property.name, year: data.year, currency: cur, water: data.water, electricity: data.electricity })}
          >
            <Download size={14} className="mr-1" /> Excel
          </Button>
        </div>
      </Card>

      {loading && !data ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !data ? null : (
        <>
          {/* Water */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-h2 text-gray-900">Water</h2>
                <p className="text-body text-gray-600 mt-1">
                  Collected from tenants, less the city-council bill. What is left is borehole water — it goes back to the owner.
                </p>
              </div>
              <div className="text-right">
                <p className="text-label uppercase text-gray-400">Borehole surplus to owner · {year}</p>
                <p className={`text-h1 tabular-nums ${data.water.total.surplus < 0 ? "text-expense" : "text-income"}`}>{fmt(data.water.total.surplus)}</p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-body">
                <thead className="text-label uppercase text-gray-400">
                  <tr>
                    <th className="text-left py-2 pr-3">Month</th>
                    <th className="text-right py-2 px-3">Units billed</th>
                    <th className="text-right py-2 px-3">Vacant / common</th>
                    <th className="text-right py-2 px-3">Billed</th>
                    <th className="text-right py-2 px-3">Collected</th>
                    <th className="text-right py-2 px-3">Council paid</th>
                    <th className="text-right py-2 pl-3">Surplus to owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.water.rows.map((r) => (
                    <tr key={r.month}>
                      <td className="py-2 pr-3 text-gray-700">{MONTHS[r.month - 1]}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{num(r.unitsBilled)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{num(r.unitsVacant + r.unitsCommon)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(r.billed)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(r.collected)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-expense">{fmt(r.supplierPaid)}</td>
                      <td className={`py-2 pl-3 text-right tabular-nums font-medium ${r.surplus < 0 ? "text-expense" : "text-gray-900"}`}>{fmt(r.surplus)}</td>
                    </tr>
                  ))}
                  <TotalRow label="Year to date" cells={[num(data.water.total.unitsBilled), num(data.water.total.unitsVacant + data.water.total.unitsCommon), fmt(data.water.total.billed), fmt(data.water.total.collected), fmt(data.water.total.supplierPaid), fmt(data.water.total.surplus)]} />
                </tbody>
              </table>
            </div>
            <RateGuide block={data.water} unit="unit" currency={cur} />
          </Card>

          {/* Electricity */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-h2 text-gray-900">Electricity</h2>
                <p className="text-body text-gray-600 mt-1">
                  Collected from tenants, less the KPLC bulk bill and generator fuel. The balance goes back to the owner.
                </p>
              </div>
              <div className="text-right">
                <p className="text-label uppercase text-gray-400">Back to owner · {year}</p>
                <p className={`text-h1 tabular-nums ${data.electricity.total.surplus < 0 ? "text-expense" : "text-income"}`}>{fmt(data.electricity.total.surplus)}</p>
              </div>
            </div>

            <h3 className="text-h3 text-gray-900 mt-5 flex items-center gap-1.5">
              Meters (kWh) <HelpTip text="The KPLC bulk meter measures everything the property bought. The check meters measure what each unit and the common areas used. The difference is loss — line losses, an unmetered load, or a reading error." />
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-body">
                <thead className="text-label uppercase text-gray-400">
                  <tr>
                    <th className="text-left py-2 pr-3">Month</th>
                    <th className="text-right py-2 px-3">KPLC bulk meter</th>
                    <th className="text-right py-2 px-3">Units billed</th>
                    <th className="text-right py-2 px-3">Vacant units</th>
                    <th className="text-right py-2 px-3">Common areas</th>
                    <th className="text-right py-2 pl-3">Unaccounted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.electricity.rows.map((r) => (
                    <tr key={r.month}>
                      <td className="py-2 pr-3 text-gray-700">{MONTHS[r.month - 1]}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{num(r.unitsBulk)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{num(r.unitsBilled)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{num(r.unitsVacant)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{num(r.unitsCommon)}</td>
                      <td className={`py-2 pl-3 text-right tabular-nums ${(r.unitsUnaccounted ?? 0) < 0 ? "text-expense" : "text-gray-700"}`}>{num(r.unitsUnaccounted)}</td>
                    </tr>
                  ))}
                  <TotalRow label="Year to date" cells={[num(data.electricity.total.unitsBulk), num(data.electricity.total.unitsBilled), num(data.electricity.total.unitsVacant), num(data.electricity.total.unitsCommon), num(data.electricity.total.unitsUnaccounted)]} />
                </tbody>
              </table>
            </div>

            <h3 className="text-h3 text-gray-900 mt-5 flex items-center gap-1.5">
              Money <HelpTip text="“Set aside” is what the tariff earmarks: units billed × the power rate for KPLC, and × the fuel rate for the generator. “Paid” is what was actually recorded on the Expenses page." />
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-body">
                <thead className="text-label uppercase text-gray-400">
                  <tr>
                    <th className="text-left py-2 pr-3">Month</th>
                    <th className="text-right py-2 px-3">Billed</th>
                    <th className="text-right py-2 px-3">Collected</th>
                    <th className="text-right py-2 px-3">Set aside: KPLC</th>
                    <th className="text-right py-2 px-3">KPLC paid</th>
                    <th className="text-right py-2 px-3">Set aside: fuel</th>
                    <th className="text-right py-2 px-3">Fuel paid</th>
                    <th className="text-right py-2 pl-3">Back to owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.electricity.rows.map((r) => (
                    <tr key={r.month}>
                      <td className="py-2 pr-3 text-gray-700">{MONTHS[r.month - 1]}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(r.billed)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(r.collected)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{fmt(r.supplyAllocation)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-expense">{fmt(r.supplierPaid)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{fmt(r.fuelAllocation)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-expense">{fmt(r.fuelPaid)}</td>
                      <td className={`py-2 pl-3 text-right tabular-nums font-medium ${r.surplus < 0 ? "text-expense" : "text-gray-900"}`}>{fmt(r.surplus)}</td>
                    </tr>
                  ))}
                  <TotalRow label="Year to date" cells={[fmt(data.electricity.total.billed), fmt(data.electricity.total.collected), fmt(data.electricity.total.supplyAllocation), fmt(data.electricity.total.supplierPaid), fmt(data.electricity.total.fuelAllocation), fmt(data.electricity.total.fuelPaid), fmt(data.electricity.total.surplus)]} />
                </tbody>
              </table>
            </div>
            <RateGuide block={data.electricity} unit="kWh" currency={cur} />
          </Card>

          {data.untaggedCollected > 0 && (
            <p className="text-caption text-amber-700">
              {fmt(data.untaggedCollected)} of utility recovery income this year does not say whether it was water or electricity, so it is
              not counted above. Edit those entries on the Income page and pick the utility.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TotalRow({ label, cells }: { label: string; cells: string[] }) {
  return (
    <tr className="bg-gray-50 font-medium">
      <td className="py-2 pr-3 pl-2 text-gray-900">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className={`py-2 ${i === cells.length - 1 ? "pl-3 pr-2" : "px-3"} text-right tabular-nums text-gray-900`}>{c}</td>
      ))}
    </tr>
  );
}

/** The "rate guide": what a unit actually costs against what tenants pay. */
function RateGuide({ block, unit, currency }: { block: ReconBlock; unit: string; currency: string }) {
  const cost = block.total.costPerUnit;
  const charged = block.tariff?.ratePerUnit ?? block.total.avgRateCharged;
  if (cost == null && charged == null) return null;
  const under = cost != null && charged != null && charged < cost;
  return (
    <div className={`mt-4 rounded-lg px-3 py-2 text-body ${under ? "bg-red-50 text-red-800" : "bg-gray-50 text-gray-700"}`}>
      <span className="font-medium">Rate guide: </span>
      {cost != null ? (
        <>it has cost <span className="tabular-nums font-medium">{formatCurrency(cost, currency)}</span> per {unit} this year</>
      ) : (
        <>no supplier cost recorded yet this year</>
      )}
      {charged != null && <> · tenants pay <span className="tabular-nums font-medium">{formatCurrency(charged, currency)}</span> per {unit}</>}
      {under && <> — below cost. Review the rate under Meters &amp; tariffs.</>}
    </div>
  );
}
