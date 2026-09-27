import { describe, it, expect } from "vitest";
import {
  defaultReadingDate,
  matchReadingRows,
  parsePeriod,
  parseReadingNumber,
  parseSheetDate,
  summariseImport,
  type ImportableMeter,
} from "../utility-readings-import";

const SEP = { year: 2026, month: 9 };
const NOW = new Date("2026-09-27T10:00:00Z");

function meter(p: Partial<ImportableMeter> & { meterId: string }): ImportableMeter {
  return {
    utility: "WATER",
    role: "UNIT",
    label: "Water",
    meterNumber: null,
    unitNumber: null,
    previousReading: 100,
    locked: false,
    reading: null,
    ...p,
  };
}

const METERS: ImportableMeter[] = [
  meter({ meterId: "w101", unitNumber: "101", meterNumber: "W-1000" }),
  meter({ meterId: "h101", unitNumber: "101", label: "Hot water", meterNumber: "W-1001" }),
  meter({ meterId: "e101", unitNumber: "101", utility: "ELECTRICITY", label: "Electricity", meterNumber: "E-1" }),
  meter({ meterId: "w102", unitNumber: "102", meterNumber: "W-2000", reading: { currentReading: 130, previousReading: 120, billed: false, readingDate: new Date(2026, 8, 20), notes: "ok" } }),
  meter({ meterId: "w103", unitNumber: "103", reading: { currentReading: 140, previousReading: 131, billed: true } }),
  meter({ meterId: "w104", unitNumber: "104", locked: true }),
  meter({ meterId: "bulk", role: "BULK", utility: "ELECTRICITY", label: "KPLC bulk", previousReading: 50_000 }),
  meter({ meterId: "dupA", unitNumber: "105", meterNumber: "X-9" }),
  meter({ meterId: "dupB", unitNumber: "106", meterNumber: "X-9" }),
];

const one = (row: Record<string, unknown>) => matchReadingRows([row], METERS, SEP, NOW)[0];

describe("parseReadingNumber", () => {
  it("reads numbers, thousands separators and blanks", () => {
    expect(parseReadingNumber(12.5)).toBe(12.5);
    expect(parseReadingNumber("1,234.5")).toBe(1234.5);
    expect(parseReadingNumber(" ")).toBeNull();
    expect(parseReadingNumber(undefined)).toBeNull();
    expect(parseReadingNumber("abc")).toBeNaN();
  });
});

describe("parseSheetDate", () => {
  const ymd = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
  it("reads day-first text, ISO text, Excel serials and Date cells", () => {
    expect(ymd(parseSheetDate("30/09/2026"))).toBe("2026-09-30");
    expect(ymd(parseSheetDate("2026-09-30"))).toBe("2026-09-30");
    expect(ymd(parseSheetDate(46295))).toBe("2026-09-30");
    expect(ymd(parseSheetDate(new Date(2026, 8, 30)))).toBe("2026-09-30");
    expect(ymd(parseSheetDate("30 Sep 2026"))).toBe("2026-09-30");
  });
  it("rejects impossible dates and passes blanks", () => {
    expect(parseSheetDate("31/02/2026")).toBe("invalid");
    expect(parseSheetDate("soon")).toBe("invalid");
    expect(parseSheetDate("")).toBeNull();
  });
});

describe("parsePeriod", () => {
  it("reads 2026-09 and Sep 2026", () => {
    expect(parsePeriod("2026-09")).toEqual(SEP);
    expect(parsePeriod("September 2026")).toEqual(SEP);
    expect(parsePeriod("")).toBeNull();
  });
});

describe("defaultReadingDate", () => {
  it("is today in the current month, else the month end", () => {
    expect(defaultReadingDate(2026, 9, NOW)).toBe(NOW);
    expect(defaultReadingDate(2026, 8, NOW).toISOString().slice(0, 10)).toBe("2026-08-31");
  });
});

describe("matchReadingRows — finding the meter", () => {
  it("prefers the Meter ID", () => {
    const r = one({ "Meter ID": "h101", Unit: "999", "Current reading": 110 });
    expect(r).toMatchObject({ action: "create", meterId: "h101", label: "Unit 101 · Hot water", consumption: 10 });
  });

  it("rejects an unknown Meter ID rather than guessing", () => {
    expect(one({ "Meter ID": "nope", "Current reading": 1 })).toMatchObject({ action: "error" });
  });

  it("falls back to the meter number", () => {
    expect(one({ "Meter No.": "e-1", Reading: 150 })).toMatchObject({ meterId: "e101", action: "create" });
  });

  it("narrows a shared meter number by unit, else asks for the Meter ID", () => {
    expect(one({ "Meter No.": "X-9", Unit: "106", Current: 101 })).toMatchObject({ meterId: "dupB" });
    expect(one({ "Meter No.": "X-9", Current: 101 }).error).toMatch(/Meter ID/);
  });

  it("matches unit + meter name, with 'Unit 101' written out", () => {
    expect(one({ Unit: "Unit 101", Meter: "hot water", "Current reading": 105 })).toMatchObject({ meterId: "h101" });
  });

  it("is ambiguous on a unit alone when it has several meters, unless the utility settles it", () => {
    expect(one({ Unit: "101", "Current reading": 105 }).error).toMatch(/Several meters/);
    expect(one({ Unit: "101", Utility: "Electricity", "Current reading": 105 })).toMatchObject({ meterId: "e101" });
  });

  it("names an unmatched row the way the file spelled it", () => {
    const r = one({ Unit: "Unit M9", Meter: "Water", "Current reading": 3 });
    expect(r.label).toBe("Unit M9 · Water");
    expect(r.error).toBe('No meter matches unit M9, "Water".');
  });

  it("matches a shared meter by name with no unit", () => {
    expect(one({ Meter: "KPLC bulk", "Current reading": 50_900 })).toMatchObject({ meterId: "bulk", consumption: 900 });
  });
});

describe("matchReadingRows — what importing does", () => {
  it("skips blank readings", () => {
    expect(one({ "Meter ID": "w101", "Current reading": "" }).action).toBe("blank");
  });

  it("rejects text and negative readings", () => {
    expect(one({ "Meter ID": "w101", "Current reading": "about 5" }).action).toBe("error");
    expect(one({ "Meter ID": "w101", "Current reading": -1 }).action).toBe("error");
  });

  it("warns (but imports) a reading below the previous one", () => {
    const r = one({ "Meter ID": "w101", "Current reading": 90 });
    expect(r.action).toBe("create");
    expect(r.warning).toBeTruthy();
  });

  it("leaves an identical re-upload of the downloaded sheet alone", () => {
    const r = one({ "Meter ID": "w102", "Current reading": 130, "Reading date": "20/09/2026", Notes: "ok" });
    expect(r.action).toBe("unchanged");
  });

  it("updates a changed reading and measures from its own previous", () => {
    expect(one({ "Meter ID": "w102", "Current reading": 135 })).toMatchObject({ action: "update", previousReading: 120, consumption: 15 });
  });

  it("sends a date only when it differs from the saved one", () => {
    const same = one({ "Meter ID": "w102", "Current reading": 135, "Reading date": "20/09/2026" });
    expect(same.readingDate).toBeUndefined();
    const moved = one({ "Meter ID": "w102", "Current reading": 130, "Reading date": "25/09/2026" });
    expect(moved).toMatchObject({ action: "update" });
    expect(moved.readingDate?.slice(0, 10)).toBe("2026-09-25");
  });

  it("refuses billed and locked meters", () => {
    expect(one({ "Meter ID": "w103", "Current reading": 141 }).error).toMatch(/invoice/);
    expect(one({ "Meter ID": "w103", "Current reading": 140 }).action).toBe("unchanged");
    expect(one({ "Meter ID": "w104", "Current reading": 141 }).error).toMatch(/locked/);
  });

  it("refuses another month's sheet and future dates", () => {
    expect(one({ Period: "2026-08", "Meter ID": "w101", "Current reading": 110 }).error).toMatch(/Aug 2026/);
    expect(one({ "Meter ID": "w101", "Current reading": 110, "Reading date": "30/10/2026" }).error).toMatch(/future/);
  });

  it("flags the same meter twice", () => {
    const rs = matchReadingRows(
      [{ "Meter ID": "w101", "Current reading": 110 }, { "Meter No.": "W-1000", "Current reading": 111 }],
      METERS,
      SEP,
      NOW,
    );
    expect(rs[1]).toMatchObject({ action: "error", rowNumber: 3 });
    expect(rs[1].error).toMatch(/row 2/);
    expect(summariseImport(rs)).toMatchObject({ create: 1, error: 1 });
  });
});
