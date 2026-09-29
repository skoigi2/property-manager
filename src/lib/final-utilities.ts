import { calcConsumption, calcReadingCharge, type UtilityType } from "./utility-billing";

// Move-out water / electricity (pure). At checkout the manager reads each of
// the unit's meters one last time; the tenant is charged for that final
// month's use plus any earlier reading of theirs that never reached an
// invoice, and the total comes off the deposit in the settlement. The Prisma
// side (loading the meters, creating + approving + billing the readings) is
// src/lib/checkout-utilities.ts.

export interface FinalMeter {
  meterId: string;
  utility: UtilityType;
  label: string;
  meterNumber: string | null;
  unitLabel: string;
  /** The reading the final one is measured from. */
  previousReading: number;
  /** Tenant rate in force for the checkout month; null = no tariff set. */
  ratePerUnit: number | null;
  /**
   * The meter's reading for the checkout month, if one exists. `editable`:
   * it is this tenant's and not on an invoice, so the final reading replaces it.
   */
  periodReading: { id: string; currentReading: number; editable: boolean; billed: boolean } | null;
  /** A later month has been read — the checkout month can't take a reading. */
  locked: boolean;
}

/** An earlier reading of this tenant's that is not on a live invoice yet. */
export interface UnbilledReading {
  readingId: string;
  meterId: string;
  utility: UtilityType;
  label: string;
  periodYear: number;
  periodMonth: number;
  consumption: number;
  status: "SUBMITTED" | "APPROVED";
  /** Approved charge, or the estimate at the tariff for its month. */
  amount: number;
  /** Review warning still standing on a SUBMITTED reading (e.g. a spike) — shown before it is approved at checkout. */
  warning?: string | null;
}

export interface FinalReadingInput {
  meterId: string;
  reading: number;
}

export interface FinalUtilityLine {
  meterId: string;
  utility: UtilityType;
  label: string;
  kind: "FINAL" | "EARLIER";
  periodYear?: number;
  periodMonth?: number;
  previousReading?: number;
  currentReading?: number;
  consumption: number;
  ratePerUnit?: number | null;
  amount: number;
}

export interface FinalUtilitiesCharge {
  lines: FinalUtilityLine[];
  water: number;
  electricity: number;
  total: number;
  /** Meters that still need a reading before the checkout can be finalised. */
  missing: string[];
  errors: { meterId: string; label: string; error: string }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whether the checkout month of this meter takes a reading on the form. */
export function meterTakesFinalReading(m: FinalMeter): boolean {
  if (m.locked) return false;
  if (m.periodReading && !m.periodReading.editable) return false;
  return true;
}

export function finalUtilitiesCharge(
  meters: FinalMeter[],
  inputs: FinalReadingInput[],
  unbilled: UnbilledReading[],
): FinalUtilitiesCharge {
  const lines: FinalUtilityLine[] = [];
  const missing: string[] = [];
  const errors: FinalUtilitiesCharge["errors"] = [];

  for (const m of meters) {
    if (!meterTakesFinalReading(m)) continue;
    const typed = inputs.find((i) => i.meterId === m.meterId)?.reading;
    const reading = typed ?? m.periodReading?.currentReading;
    if (reading === undefined || !Number.isFinite(reading)) {
      missing.push(m.label);
      continue;
    }
    const consumption = calcConsumption(m.previousReading, reading);
    if (consumption < 0) {
      errors.push({ meterId: m.meterId, label: m.label, error: `${m.label}: the final reading is below the previous one (${m.previousReading}).` });
      continue;
    }
    if (m.ratePerUnit === null) {
      errors.push({ meterId: m.meterId, label: m.label, error: `${m.label}: no ${m.utility === "WATER" ? "water" : "electricity"} rate is set for this month — add one under Utilities → Meters & tariffs.` });
      continue;
    }
    lines.push({
      meterId: m.meterId,
      utility: m.utility,
      label: m.label,
      kind: "FINAL",
      previousReading: m.previousReading,
      currentReading: reading,
      consumption,
      ratePerUnit: m.ratePerUnit,
      amount: calcReadingCharge(consumption, m.ratePerUnit),
    });
  }

  for (const u of unbilled) {
    if (u.consumption < 0) {
      errors.push({ meterId: u.meterId, label: u.label, error: `${u.label}: an earlier reading is below its previous one — correct it on Utilities → Review & bill first.` });
      continue;
    }
    lines.push({
      meterId: u.meterId,
      utility: u.utility,
      label: u.label,
      kind: "EARLIER",
      periodYear: u.periodYear,
      periodMonth: u.periodMonth,
      consumption: u.consumption,
      amount: round2(u.amount),
    });
  }

  const water = round2(lines.filter((l) => l.utility === "WATER").reduce((s, l) => s + l.amount, 0));
  const electricity = round2(lines.filter((l) => l.utility === "ELECTRICITY").reduce((s, l) => s + l.amount, 0));
  return { lines, water, electricity, total: round2(water + electricity), missing, errors };
}

/**
 * How much of the final utilities bill the deposit covers: whatever is left of
 * it after damage, rent and itemised deductions, never more than the bill.
 */
export function depositCoverForUtilities(depositLeft: number, total: number): number {
  return round2(Math.max(0, Math.min(total, depositLeft)));
}
