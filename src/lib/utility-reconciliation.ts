// Utility reconciliation — pure (no prisma), unit-tested.
//
// Tenants pay one rate per unit of water or electricity. Behind that, the
// manager needs to see where the money goes:
//   Water        collected − city-council bill            = borehole surplus → owner
//   Electricity  collected − KPLC bill − generator fuel   = surplus → owner
// plus, for electricity, what the tariff SET ASIDE for each (units × power
// rate, units × fuel rate) against what was actually paid, and how the bulk
// KPLC meter compares with the sum of the check meters (losses).
//
// Timing: "billed" and the meter columns follow the READING month;
// "collected" and the supplier / fuel costs follow the CASH date (receipt
// date, expense date). A June council bill paid in July lands in July — so a
// single month can look lopsided while the year-to-date row is the honest
// picture.

import type { UtilityType, MeterRole } from "@/lib/utility-billing";

export interface ReconReading {
  utility: UtilityType;
  role: MeterRole;
  periodYear: number;
  periodMonth: number;
  consumption: number;
  /** Null on bulk / common meters and vacant units. */
  amount: number | null;
  supplyRate: number | null;
  fuelRate: number | null;
  /** False for a vacant unit's reading — consumed, never billed. */
  hasTenant: boolean;
  /**
   * A SUBMITTED reading the manager has not approved yet. It is real
   * consumption the bulk meter has already counted, so it must not read as
   * "unaccounted" — but it is not billed and carries no money yet.
   */
  pending?: boolean;
}

export interface ReconCash {
  date: Date;
  amount: number;
}

export interface ReconMonthInput {
  year: number;
  month: number;
}

export interface UtilityReconRow {
  year: number;
  month: number;
  /** Unit meters with a tenant — what tenants were charged for. */
  unitsBilled: number;
  /** Unit meters with no tenant (vacant) — consumed, not billed. */
  unitsVacant: number;
  unitsCommon: number;
  /** Unit / common readings still awaiting approval — metered, not yet billed. */
  unitsPending: number;
  /** Bulk supply meter; null when the property has none / it wasn't read. */
  unitsBulk: number | null;
  /** bulk − billed − vacant − common − pending; null without a bulk reading. */
  unitsUnaccounted: number | null;
  billed: number;
  /** units × power (supply) rate — what the tariff sets aside for the supplier. */
  supplyAllocation: number;
  /** units × fuel rate — what the tariff sets aside for generator fuel. */
  fuelAllocation: number;
  collected: number;
  supplierPaid: number;
  fuelPaid: number;
  /** collected − supplierPaid − fuelPaid. */
  surplus: number;
  /** (supplierPaid + fuelPaid) ÷ units purchased (bulk, else everything metered); null when no units. */
  costPerUnit: number | null;
  /** billed ÷ unitsBilled — the average rate tenants were charged. */
  avgRateCharged: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function inMonth(d: Date, year: number, month: number): boolean {
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function finish(row: UtilityReconRow, hasBulk: boolean): UtilityReconRow {
  const metered = row.unitsBilled + row.unitsVacant + row.unitsCommon + row.unitsPending;
  row.unitsPending = round3(row.unitsPending);
  row.unitsBilled = round3(row.unitsBilled);
  row.unitsVacant = round3(row.unitsVacant);
  row.unitsCommon = round3(row.unitsCommon);
  row.unitsBulk = hasBulk ? round3(row.unitsBulk ?? 0) : null;
  row.unitsUnaccounted = hasBulk ? round3((row.unitsBulk ?? 0) - metered) : null;
  row.billed = round2(row.billed);
  row.supplyAllocation = round2(row.supplyAllocation);
  row.fuelAllocation = round2(row.fuelAllocation);
  row.collected = round2(row.collected);
  row.supplierPaid = round2(row.supplierPaid);
  row.fuelPaid = round2(row.fuelPaid);
  row.surplus = round2(row.collected - row.supplierPaid - row.fuelPaid);
  const purchased = hasBulk && (row.unitsBulk ?? 0) > 0 ? row.unitsBulk! : metered;
  const cost = row.supplierPaid + row.fuelPaid;
  row.costPerUnit = purchased > 0 && cost > 0 ? round2(cost / purchased) : null;
  row.avgRateCharged = row.unitsBilled > 0 ? round2(row.billed / row.unitsBilled) : null;
  return row;
}

const emptyRow = (year: number, month: number): UtilityReconRow => ({
  year, month,
  unitsBilled: 0, unitsVacant: 0, unitsCommon: 0, unitsPending: 0, unitsBulk: 0, unitsUnaccounted: null,
  billed: 0, supplyAllocation: 0, fuelAllocation: 0, collected: 0, supplierPaid: 0, fuelPaid: 0,
  surplus: 0, costPerUnit: null, avgRateCharged: null,
});

export function buildUtilityReconciliation(input: {
  utility: UtilityType;
  months: ReconMonthInput[];
  /** APPROVED readings only. */
  readings: ReconReading[];
  /** UTILITY_RECOVERY receipts tagged with this utility. */
  collections: ReconCash[];
  /** Supplier cost: WATER expenses (council) or ELECTRICITY expenses (KPLC). */
  supplierCosts: ReconCash[];
  /** GENERATOR expenses — electricity only; ignored for water. */
  fuelCosts?: ReconCash[];
}): { rows: UtilityReconRow[]; total: UtilityReconRow } {
  const fuelCosts = input.utility === "ELECTRICITY" ? input.fuelCosts ?? [] : [];
  const rows: UtilityReconRow[] = [];
  const total = emptyRow(0, 0);
  let anyBulk = false;

  for (const { year, month } of input.months) {
    const row = emptyRow(year, month);
    let hasBulk = false;
    for (const r of input.readings) {
      if (r.utility !== input.utility || r.periodYear !== year || r.periodMonth !== month) continue;
      if (r.role === "BULK") {
        hasBulk = true;
        row.unitsBulk = (row.unitsBulk ?? 0) + r.consumption;
      } else if (r.pending) {
        row.unitsPending += Math.max(r.consumption, 0);
      } else if (r.role === "COMMON") {
        row.unitsCommon += r.consumption;
      } else if (!r.hasTenant) {
        row.unitsVacant += r.consumption;
      } else {
        row.unitsBilled += r.consumption;
        row.billed += r.amount ?? 0;
        row.supplyAllocation += r.consumption * (r.supplyRate ?? 0);
        row.fuelAllocation += r.consumption * (r.fuelRate ?? 0);
      }
    }
    for (const c of input.collections) if (inMonth(c.date, year, month)) row.collected += c.amount;
    for (const c of input.supplierCosts) if (inMonth(c.date, year, month)) row.supplierPaid += c.amount;
    for (const c of fuelCosts) if (inMonth(c.date, year, month)) row.fuelPaid += c.amount;

    total.unitsBilled += row.unitsBilled;
    total.unitsVacant += row.unitsVacant;
    total.unitsCommon += row.unitsCommon;
    total.unitsPending += row.unitsPending;
    if (hasBulk) {
      anyBulk = true;
      total.unitsBulk = (total.unitsBulk ?? 0) + (row.unitsBulk ?? 0);
    }
    total.billed += row.billed;
    total.supplyAllocation += row.supplyAllocation;
    total.fuelAllocation += row.fuelAllocation;
    total.collected += row.collected;
    total.supplierPaid += row.supplierPaid;
    total.fuelPaid += row.fuelPaid;

    rows.push(finish(row, hasBulk));
  }
  return { rows, total: finish(total, anyBulk) };
}

/** Jan … the given month of a year (or all 12 for a past year). */
export function monthsOfYear(year: number, now = new Date()): ReconMonthInput[] {
  const last = year < now.getFullYear() ? 12 : year > now.getFullYear() ? 0 : now.getMonth() + 1;
  return Array.from({ length: last }, (_, i) => ({ year, month: i + 1 }));
}
