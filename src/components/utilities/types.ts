import type { UtilityType, MeterRole, ReadingAnomaly } from "@/lib/utility-billing";

// Client-side shapes of the /api/utilities/* payloads. Money fields are
// optional because the CARETAKER payload never carries them.

export interface SheetReading {
  id: string;
  status: "SUBMITTED" | "APPROVED" | "VOID";
  readingDate: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  notes: string | null;
  previousOverrideReason: string | null;
  readByName: string | null;
  readByUserId: string | null;
  approvedByName: string | null;
  photoUrls: string[];
  billed: boolean;
  ratePerUnit?: number | null;
  amount?: number | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  tenantName?: string | null;
  anomalies?: ReadingAnomaly[];
  estimatedAmount?: number | null;
  estimatedRate?: number | null;
}

export interface SheetRow {
  meterId: string;
  utility: UtilityType;
  role: MeterRole;
  label: string;
  meterNumber: string | null;
  unitId: string | null;
  unitNumber: string | null;
  occupantName: string | null;
  unitLabel: string;
  previousReading: number;
  locked: boolean;
  reading: SheetReading | null;
}

export interface UtilitySettingDto {
  unitLabel: string;
  requirePhoto: boolean;
  holdInvoicesForReadings: boolean;
}

export interface ReadingSheet {
  rows: SheetRow[];
  settings: Record<UtilityType, UtilitySettingDto>;
  hasTariff: Record<UtilityType, boolean>;
}

export interface MeterDto {
  id: string;
  utility: UtilityType;
  role: MeterRole;
  label: string;
  meterNumber: string | null;
  unitId: string | null;
  unitNumber: string | null;
  isActive: boolean;
  openingReading: number;
  openingReadingDate: string | null;
  readingsCount: number;
  ratePerUnitOverride?: number | null;
}

export interface TariffDto {
  id: string;
  utility: UtilityType;
  effectiveFrom: string;
  supplyRate: number;
  fuelRate: number;
  notes: string | null;
  createdByName: string | null;
}

/** "Unit A3 · Hot water" / "KPLC bulk". */
export function meterTitle(r: { role: MeterRole; unitNumber: string | null; label: string }): string {
  return r.role === "UNIT" && r.unitNumber ? `Unit ${r.unitNumber} · ${r.label}` : r.label;
}

export function fmtReading(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/** Server `error` strings are user-facing; fall back when the body isn't JSON. */
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // not JSON
  }
  return fallback;
}

const UTILITY_ORDER: Record<string, number> = { WATER: 0, ELECTRICITY: 1 };

/**
 * Door-to-door order: unit meters by unit number (101, 102 … 1001, not
 * lexical), water before electricity within a unit, the shared meters (KPLC
 * bulk, common areas) last. Stable, so a unit's cold/hot water keep the
 * sheet's order.
 */
export function byUnitOrder<T extends { role: string; unitNumber: string | null; utility: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const shared = Number(a.role !== "UNIT") - Number(b.role !== "UNIT");
    if (shared) return shared;
    const unit = (a.unitNumber ?? "").localeCompare(b.unitNumber ?? "", undefined, { numeric: true, sensitivity: "base" });
    if (unit) return unit;
    return (UTILITY_ORDER[a.utility] ?? 9) - (UTILITY_ORDER[b.utility] ?? 9);
  });
}
