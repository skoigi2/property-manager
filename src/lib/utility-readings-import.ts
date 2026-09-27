import { calcConsumption, type MeterRole, type UtilityType } from "./utility-billing";

// Pure rules for the meter-reading Excel round trip: the downloaded sheet
// carries every active meter of the month (with its Meter ID); the uploaded
// file is matched back to meters here, in the browser, so the manager sees a
// row-by-row preview before anything is saved. The import route re-checks
// that every meter belongs to the property and goes through the same
// submitReading / updateReading invariants as a typed reading.

export const READING_SHEET_COLUMNS = [
  "Period",
  "Unit",
  "Meter",
  "Utility",
  "Meter No.",
  "Occupant",
  "Previous reading",
  "Current reading",
  "Reading date",
  "Notes",
  "Meter ID",
] as const;

export const MAX_IMPORT_ROWS = 500;

/** The slice of a reading-sheet row the matcher needs (structural: `SheetRow` fits). */
export interface ImportableMeter {
  meterId: string;
  utility: UtilityType;
  role: MeterRole;
  label: string;
  meterNumber: string | null;
  unitNumber: string | null;
  previousReading: number;
  locked: boolean;
  reading: {
    currentReading: number;
    previousReading: number;
    billed: boolean;
    readingDate?: string | Date;
    notes?: string | null;
  } | null;
}

export type ImportAction = "create" | "update" | "unchanged" | "blank" | "error";

export interface ImportRowResult {
  /** 1-based spreadsheet row (the header is row 1). */
  rowNumber: number;
  /** What the row said, for the preview: "Unit 101 · Water" / "KPLC bulk". */
  label: string;
  action: ImportAction;
  error?: string;
  warning?: string;
  meterId?: string;
  previousReading?: number;
  currentReading?: number;
  consumption?: number;
  /** ISO string, only when the file gave a date (else the server defaults it). */
  readingDate?: string;
  notes?: string;
}

// ─── Cell parsing ────────────────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  period: ["period", "month"],
  unit: ["unit", "unit no", "unit no.", "unit number"],
  meter: ["meter", "meter label", "label", "meter name"],
  utility: ["utility", "type"],
  meterNumber: ["meter no.", "meter no", "meter number", "meter #", "serial"],
  current: ["current reading", "current", "reading", "new reading", "this month"],
  date: ["reading date", "date", "date read"],
  notes: ["notes", "note", "comment", "comments"],
  meterId: ["meter id", "id"],
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** "Unit 101" / "unit no. 101" / "101" → "101", as typed (for messages). */
function bareUnit(v: unknown): string {
  return String(v ?? "").trim().replace(/\s+/g, " ").replace(/^unit\s*(no\.?|number)?\s*/i, "");
}

/** bareUnit, case-folded for matching. */
function normUnit(v: unknown): string {
  return bareUnit(v).toLowerCase();
}

/** Maps each canonical field to the header actually used in the file. */
export function resolveHeaders(headers: string[]): Partial<Record<keyof typeof HEADER_ALIASES, string>> {
  const out: Partial<Record<keyof typeof HEADER_ALIASES, string>> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const hit = headers.find((h) => aliases.includes(norm(h)));
    if (hit !== undefined) out[field as keyof typeof HEADER_ALIASES] = hit;
  }
  return out;
}

/** Blank → null; "1,234.5" → 1234.5; anything else unreadable → NaN. */
export function parseReadingNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/[,\s]/g, "");
  if (s === "" || s === "-" || s === "—") return null;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

/**
 * A spreadsheet date: a Date (SheetJS `cellDates`), an Excel serial number,
 * "2026-09-30", "30/09/2026", "30-09-2026" (day first, as in Kenya / UK) or
 * "30 Sep 2026". Blank → null; unreadable → "invalid". Dates come back at
 * noon UTC so a timezone never moves them to the previous day.
 */
export function parseSheetDate(v: unknown): Date | null | "invalid" {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const atNoon = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : "invalid";
  };
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? "invalid" : atNoon(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 1) return "invalid";
    const ms = Math.round((v - 25569) * 86_400_000); // Excel serial → Unix epoch
    const dt = new Date(ms);
    return atNoon(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return atNoon(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return atNoon(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? "invalid" : atNoon(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "2026-09" / "Sep 2026" / "September 2026" / a date → { year, month }. */
export function parsePeriod(v: unknown): { year: number; month: number } | null {
  if (v instanceof Date && !isNaN(v.getTime())) return { year: v.getFullYear(), month: v.getMonth() + 1 };
  const s = norm(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { year: +m[1], month: +m[2] };
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m && MONTHS.includes(m[1])) return { year: +m[2], month: MONTHS.indexOf(m[1]) + 1 };
  return null;
}

/** "30/09/2026" in the viewer's calendar — how the sheet writes a reading date. */
export function sheetDateCell(d: string | Date): string {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

/** Same calendar day: a stored reading date (local) vs a parsed sheet date (noon UTC). */
function sameDay(stored: string | Date, parsed: Date): boolean {
  const s = new Date(stored);
  return (
    s.getFullYear() === parsed.getUTCFullYear() &&
    s.getMonth() === parsed.getUTCMonth() &&
    s.getDate() === parsed.getUTCDate()
  );
}

export function periodCell(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodLabel(p: { year: number; month: number }): string {
  return new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Month-end reading date when none was typed: today when capturing the
 * current month, else the last day of the month being captured.
 */
export function defaultReadingDate(year: number, month: number, now: Date = new Date()): Date {
  const sameMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  return sameMonth ? now : new Date(Date.UTC(year, month, 0, 12));
}

// ─── Matching ────────────────────────────────────────────────────────────────

function meterDisplay(m: Pick<ImportableMeter, "role" | "unitNumber" | "label">): string {
  return m.role === "UNIT" && m.unitNumber ? `Unit ${m.unitNumber} · ${m.label}` : m.label;
}

const UTILITY_WORD: Record<UtilityType, string> = { WATER: "water", ELECTRICITY: "electricity" };

function utilityOf(v: unknown): UtilityType | null {
  const s = norm(v);
  if (!s) return null;
  if (s.startsWith("water")) return "WATER";
  if (s.startsWith("elec") || s === "power" || s === "kplc") return "ELECTRICITY";
  return null;
}

/**
 * Finds the meter a row is about: Meter ID first (the downloaded sheet always
 * carries it), then the meter number, then unit + meter name (+ utility).
 */
function findMeter(
  row: Record<string, unknown>,
  h: ReturnType<typeof resolveHeaders>,
  meters: ImportableMeter[],
): { meter: ImportableMeter } | { error: string } {
  const id = h.meterId ? String(row[h.meterId] ?? "").trim() : "";
  if (id) {
    const meter = meters.find((m) => m.meterId === id);
    return meter ? { meter } : { error: "Meter ID is not an active meter on this property." };
  }

  const unit = h.unit ? normUnit(row[h.unit]) : "";
  const label = h.meter ? norm(row[h.meter]) : "";
  const utility = h.utility ? utilityOf(row[h.utility]) : null;
  const narrow = (list: ImportableMeter[]) =>
    list.filter(
      (m) =>
        (!unit || normUnit(m.unitNumber) === unit) &&
        (!label || norm(m.label) === label) &&
        (!utility || m.utility === utility),
    );

  const number = h.meterNumber ? norm(row[h.meterNumber]) : "";
  if (number) {
    const byNumber = meters.filter((m) => norm(m.meterNumber) === number);
    if (byNumber.length === 1) return { meter: byNumber[0] };
    if (byNumber.length > 1) {
      const narrowed = narrow(byNumber);
      if (narrowed.length === 1) return { meter: narrowed[0] };
      return { error: `Several meters have number ${String(row[h.meterNumber!]).trim()} — add the Meter ID column.` };
    }
  }

  if (!unit && !label) {
    return { error: number ? `No meter has number ${String(row[h.meterNumber!]).trim()}.` : "Say which meter: fill Meter ID, Meter No., or Unit and Meter." };
  }
  // A shared meter (KPLC bulk / common areas) has no unit: match it on the name.
  const pool = unit ? meters.filter((m) => m.role === "UNIT") : meters.filter((m) => m.role !== "UNIT");
  const hits = narrow(pool);
  if (hits.length === 1) return { meter: hits[0] };
  const what = [
    unit && `unit ${bareUnit(row[h.unit!])}`,
    label && `"${String(row[h.meter!]).trim()}"`,
    utility && UTILITY_WORD[utility],
  ].filter(Boolean).join(", ");
  return hits.length === 0
    ? { error: `No meter matches ${what}.` }
    : { error: `Several meters match ${what} — add the Meter column or the Meter ID.` };
}

/**
 * Turns the uploaded sheet's rows (SheetJS `sheet_to_json`, header row = keys)
 * into a preview: each row's meter, what importing it would do, and why a row
 * can't be imported. Nothing here touches the database.
 */
export function matchReadingRows(
  rows: Record<string, unknown>[],
  meters: ImportableMeter[],
  period: { year: number; month: number },
  now: Date = new Date(),
): ImportRowResult[] {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const h = resolveHeaders(headers);
  const seen = new Map<string, number>();

  return rows.map((row, i): ImportRowResult => {
    const rowNumber = i + 2;
    const rawLabel = [h.unit && bareUnit(row[h.unit]) && `Unit ${bareUnit(row[h.unit])}`, h.meter && String(row[h.meter] ?? "").trim()]
      .filter(Boolean)
      .join(" · ");
    const base = { rowNumber, label: rawLabel || `Row ${rowNumber}` };

    const current = h.current ? parseReadingNumber(row[h.current]) : null;
    if (current === null) {
      // A wholly empty line (Excel leaves them) and an unread meter look the same: skip.
      return { ...base, action: "blank" };
    }

    const found = findMeter(row, h, meters);
    if ("error" in found) return { ...base, action: "error", error: found.error };
    const meter = found.meter;
    const out = { ...base, label: meterDisplay(meter), meterId: meter.meterId };

    const filePeriod = h.period ? parsePeriod(row[h.period]) : null;
    if (filePeriod && (filePeriod.year !== period.year || filePeriod.month !== period.month)) {
      return { ...out, action: "error", error: `This row is for ${periodLabel(filePeriod)} — switch the page to that month to import it.` };
    }

    const dup = seen.get(meter.meterId);
    if (dup) return { ...out, action: "error", error: `This meter is already on row ${dup}.` };
    seen.set(meter.meterId, rowNumber);

    if (!Number.isFinite(current) || current < 0) {
      return { ...out, action: "error", error: "The current reading must be a number, 0 or more." };
    }

    const existing = meter.reading;
    // Only what differs from the saved reading is sent: re-importing the
    // downloaded sheet unchanged must not touch a reading, and a changed date
    // sends an approved reading back for review.
    let readingDate: string | undefined;
    if (h.date) {
      const d = parseSheetDate(row[h.date]);
      if (d === "invalid") return { ...out, action: "error", error: "The reading date isn't a date (use 30/09/2026)." };
      if (d) {
        if (d.getTime() > now.getTime() + 86_400_000) return { ...out, action: "error", error: "The reading date is in the future." };
        if (!(existing?.readingDate && sameDay(existing.readingDate, d))) readingDate = d.toISOString();
      }
    }
    const typedNotes = h.notes ? String(row[h.notes] ?? "").trim().slice(0, 1000) : "";
    const notes = typedNotes && typedNotes !== (existing?.notes ?? "").trim() ? typedNotes : undefined;

    const previousReading = existing?.previousReading ?? meter.previousReading;
    const consumption = calcConsumption(previousReading, current);
    const detail = {
      ...out,
      previousReading,
      currentReading: current,
      consumption,
      readingDate,
      notes,
      ...(consumption < 0 ? { warning: "Lower than the previous reading — check it on Review & bill." } : {}),
    };

    if (meter.locked) {
      return { ...detail, action: "error", error: "A later month has been read for this meter, so this month is locked." };
    }
    if (existing?.billed) {
      if (existing.currentReading === current) return { ...detail, action: "unchanged" };
      return { ...detail, action: "error", error: "This reading is already on an invoice — void it on Review & bill to correct it." };
    }
    if (existing) {
      return { ...detail, action: existing.currentReading === current && !readingDate && !notes ? "unchanged" : "update" };
    }
    return { ...detail, action: "create" };
  });
}

export function summariseImport(results: ImportRowResult[]) {
  const count = (a: ImportAction) => results.filter((r) => r.action === a).length;
  return {
    create: count("create"),
    update: count("update"),
    unchanged: count("unchanged"),
    blank: count("blank"),
    error: count("error"),
    warnings: results.filter((r) => r.warning && (r.action === "create" || r.action === "update")).length,
  };
}
