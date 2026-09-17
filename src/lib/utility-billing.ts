// Utility metering — pure rules (no prisma / next-auth, unit-tested).
//
// A caretaker reads each meter at month end. Consumption is current − previous
// and the charge is consumption × rate, where the tenant rate per unit is the
// property tariff's supplyRate + fuelRate (water uses supplyRate only) unless
// the meter carries its own override (a hot-water meter). Readings for month M
// are billed on the invoice for month M+1, together with the rent.
//
// The Prisma side lives in src/lib/utility-readings.ts.

export type UtilityType = "WATER" | "ELECTRICITY";
export type MeterRole = "UNIT" | "COMMON" | "BULK";
export type MeterReadingStatus = "SUBMITTED" | "APPROVED" | "VOID";

export const UTILITY_TYPES: UtilityType[] = ["WATER", "ELECTRICITY"];

export const UTILITY_LABEL: Record<UtilityType, string> = {
  WATER: "Water",
  ELECTRICITY: "Electricity",
};

export const METER_ROLE_LABEL: Record<MeterRole, string> = {
  UNIT: "Unit meter",
  COMMON: "Common areas",
  BULK: "Bulk supply meter",
};

export const DEFAULT_UNIT_LABEL: Record<UtilityType, string> = {
  WATER: "units",
  ELECTRICITY: "kWh",
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * current − previous, rounded to 3 dp. Meter dials carry decimals and float
 * subtraction does not (48.70 − 46.80 = 1.9000000000000057).
 */
export function calcConsumption(previous: number, current: number): number {
  return round(current - previous, 3);
}

export interface TariffLike {
  effectiveFrom: Date;
  supplyRate: number;
  fuelRate?: number | null;
}

/**
 * The tariff in force for a reading period: the latest one whose
 * effectiveFrom falls on or before the LAST day of that month, so a tariff
 * dated mid-month already applies to that month's readings. Tariffs carry
 * forward until a newer one exists. Null when none has started yet.
 */
export function resolveTariffForPeriod<T extends TariffLike>(
  tariffs: T[],
  periodYear: number,
  periodMonth: number,
): T | null {
  const periodEnd = Date.UTC(periodYear, periodMonth, 0, 23, 59, 59, 999);
  let best: T | null = null;
  for (const t of tariffs) {
    const at = t.effectiveFrom.getTime();
    if (at > periodEnd) continue;
    if (!best || at > best.effectiveFrom.getTime()) best = t;
  }
  return best;
}

export interface ReadingRates {
  supplyRate: number;
  fuelRate: number;
  ratePerUnit: number;
}

/** Meter override wins; else tariff supply + fuel. Null = no rate configured. */
export function resolveReadingRates(
  tariff: TariffLike | null,
  ratePerUnitOverride?: number | null,
): ReadingRates | null {
  if (ratePerUnitOverride != null && ratePerUnitOverride >= 0) {
    return { supplyRate: ratePerUnitOverride, fuelRate: 0, ratePerUnit: ratePerUnitOverride };
  }
  if (!tariff) return null;
  const supplyRate = tariff.supplyRate;
  const fuelRate = tariff.fuelRate ?? 0;
  return { supplyRate, fuelRate, ratePerUnit: round(supplyRate + fuelRate, 4) };
}

/** consumption × rate, 2 dp. A negative consumption never produces a charge. */
export function calcReadingCharge(consumption: number, ratePerUnit: number): number {
  if (consumption <= 0 || ratePerUnit <= 0) return 0;
  return round(consumption * ratePerUnit, 2);
}

export type ReadingAnomalyCode = "NEGATIVE" | "ZERO_OCCUPIED" | "HIGH";

export interface ReadingAnomaly {
  code: ReadingAnomalyCode;
  message: string;
}

/**
 * Flags the manager sees before approving. `history` is the meter's earlier
 * consumptions, most recent first. NEGATIVE blocks approval (the reading is
 * below the previous one — mistyped, or the meter was replaced and needs a
 * previous-reading override); the others are warnings only.
 */
export function readingAnomalies(input: {
  consumption: number;
  occupied: boolean;
  history: number[];
}): ReadingAnomaly[] {
  const out: ReadingAnomaly[] = [];
  if (input.consumption < 0) {
    out.push({
      code: "NEGATIVE",
      message: "Reading is lower than the previous one. Correct it, or override the previous reading if the meter was replaced.",
    });
    return out;
  }
  if (input.consumption === 0 && input.occupied) {
    out.push({ code: "ZERO_OCCUPIED", message: "No consumption on an occupied unit." });
  }
  const recent = input.history.filter((c) => c > 0).slice(0, 3);
  if (recent.length >= 2) {
    const avg = recent.reduce((s, c) => s + c, 0) / recent.length;
    if (input.consumption > avg * 2.5) {
      out.push({
        code: "HIGH",
        message: `More than 2.5× the recent average (${round(avg, 2)}).`,
      });
    }
  }
  return out;
}

export function blocksApproval(anomalies: ReadingAnomaly[]): boolean {
  return anomalies.some((a) => a.code === "NEGATIVE");
}

function fmtReading(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function fmtQty(n: number): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}

export interface ReadingLineInput {
  periodYear: number;
  periodMonth: number;
  /** Meter label, e.g. "Water", "Hot water", "Electricity". */
  label: string;
  unitLabel: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  ratePerUnit: number | null;
}

/** "Jun 26 Water: 3 units (Prev: 176.00, Curr: 179.00) @ 175.00" */
export function readingLineLabel(r: ReadingLineInput): string {
  const period = `${MONTHS_SHORT[r.periodMonth - 1]} ${String(r.periodYear).slice(-2)}`;
  const rate = r.ratePerUnit == null ? "" : ` @ ${r.ratePerUnit.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `${period} ${r.label}: ${fmtQty(r.consumption)} ${r.unitLabel} (Prev: ${fmtReading(r.previousReading)}, Curr: ${fmtReading(r.currentReading)})${rate}`;
}

/** Comparable period key — 2026-06 → 24318. */
export function periodIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/**
 * A reading is billable on an invoice when its period is STRICTLY before the
 * invoice period: June's readings (taken at the end of June) go on the July
 * invoice, and older stragglers ride along.
 */
export function isBillableOnInvoice(
  reading: { periodYear: number; periodMonth: number },
  invoice: { periodYear: number; periodMonth: number },
): boolean {
  return periodIndex(reading.periodYear, reading.periodMonth) < periodIndex(invoice.periodYear, invoice.periodMonth);
}

/** The month before — the reading period an invoice normally bills. */
export function previousPeriod(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export interface BillableReading {
  utility: UtilityType;
  amount: number | null;
}

/** Invoice.waterAmount / electricityAmount for a set of attached readings. */
export function sumReadingsByUtility(readings: BillableReading[]): { waterAmount: number; electricityAmount: number } {
  let water = 0;
  let electricity = 0;
  for (const r of readings) {
    if (r.utility === "WATER") water += r.amount ?? 0;
    else electricity += r.amount ?? 0;
  }
  return { waterAmount: round(water, 2), electricityAmount: round(electricity, 2) };
}

/**
 * Whether an existing invoice may still take (or lose) utility lines. Once
 * any money is booked against it the allocator has walked its buckets in a
 * fixed order, so changing a bucket would mis-attribute those payments.
 */
export function canChangeInvoiceUtilities(inv: {
  status: string;
  paidAmount?: number | null;
  incomeEntryCount: number;
}): boolean {
  if (!["DRAFT", "SENT", "OVERDUE"].includes(inv.status)) return false;
  if ((inv.paidAmount ?? 0) > 0) return false;
  return inv.incomeEntryCount === 0;
}
