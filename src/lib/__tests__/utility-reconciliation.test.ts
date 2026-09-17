import { describe, it, expect } from "vitest";
import { buildUtilityReconciliation, monthsOfYear, type ReconReading } from "../utility-reconciliation";

const d = (s: string) => new Date(`${s}T12:00:00`);
const months = [{ year: 2026, month: 6 }, { year: 2026, month: 7 }];

const reading = (over: Partial<ReconReading>): ReconReading => ({
  utility: "WATER", role: "UNIT", periodYear: 2026, periodMonth: 6,
  consumption: 5, amount: 750, supplyRate: 150, fuelRate: 0, hasTenant: true, ...over,
});

describe("water reconciliation", () => {
  const result = buildUtilityReconciliation({
    utility: "WATER",
    months,
    readings: [
      reading({}),
      reading({ consumption: 3, amount: 450 }),
      reading({ consumption: 2, amount: 300, hasTenant: false }), // vacant unit
      reading({ utility: "ELECTRICITY", consumption: 100, amount: 3000 }), // other utility — ignored
    ],
    collections: [{ date: d("2026-07-04"), amount: 1200 }],
    supplierCosts: [{ date: d("2026-07-10"), amount: 400 }],
    fuelCosts: [{ date: d("2026-07-10"), amount: 9999 }], // never applies to water
  });

  it("bills tenants only — a vacant unit's water is consumed, not billed", () => {
    expect(result.rows[0]).toMatchObject({ unitsBilled: 8, unitsVacant: 2, billed: 1200, unitsBulk: null, unitsUnaccounted: null });
  });

  it("books cash in the month it moved: June's bill is collected and the council paid in July", () => {
    expect(result.rows[0]).toMatchObject({ collected: 0, supplierPaid: 0, surplus: 0 });
    expect(result.rows[1]).toMatchObject({ collected: 1200, supplierPaid: 400, fuelPaid: 0, surplus: 800 });
  });

  it("the period total is the borehole surplus that goes back to the owner", () => {
    expect(result.total).toMatchObject({ billed: 1200, collected: 1200, supplierPaid: 400, surplus: 800, avgRateCharged: 150 });
  });
});

describe("electricity reconciliation", () => {
  const e = (over: Partial<ReconReading>) => reading({ utility: "ELECTRICITY", supplyRate: 25, fuelRate: 5, ...over });
  const result = buildUtilityReconciliation({
    utility: "ELECTRICITY",
    months: [{ year: 2026, month: 6 }],
    readings: [
      e({ consumption: 100, amount: 3000 }),
      e({ consumption: 90, amount: 2700 }),
      e({ role: "COMMON", consumption: 50, amount: null, supplyRate: null, fuelRate: null }),
      e({ role: "BULK", consumption: 260, amount: null, supplyRate: null, fuelRate: null }),
    ],
    collections: [{ date: d("2026-06-28"), amount: 5700 }],
    supplierCosts: [{ date: d("2026-06-15"), amount: 4420 }],
    fuelCosts: [{ date: d("2026-06-20"), amount: 780 }],
  });
  const row = result.rows[0];

  it("compares the KPLC bulk meter with the check meters", () => {
    expect(row).toMatchObject({ unitsBulk: 260, unitsBilled: 190, unitsCommon: 50, unitsUnaccounted: 20 });
  });

  it("splits what the tariff set aside for KPLC and for generator fuel", () => {
    expect(row.supplyAllocation).toBe(4750);
    expect(row.fuelAllocation).toBe(950);
    expect(row.billed).toBe(5700);
  });

  it("surplus to the owner = collected − KPLC − fuel", () => {
    expect(row.surplus).toBe(500);
  });

  it("actual cost per kWh uses the bulk meter as units purchased", () => {
    expect(row.costPerUnit).toBe(20); // (4420 + 780) / 260
    expect(row.avgRateCharged).toBe(30);
  });

  it("falls back to everything metered when there is no bulk meter", () => {
    const noBulk = buildUtilityReconciliation({
      utility: "ELECTRICITY",
      months: [{ year: 2026, month: 6 }],
      readings: [e({ consumption: 100, amount: 3000 })],
      collections: [],
      supplierCosts: [{ date: d("2026-06-15"), amount: 2000 }],
    });
    expect(noBulk.rows[0].unitsBulk).toBeNull();
    expect(noBulk.rows[0].costPerUnit).toBe(20);
    expect(noBulk.rows[0].surplus).toBe(-2000);
  });
});

describe("monthsOfYear", () => {
  const now = new Date(2026, 8, 17);
  it("runs to the current month this year, all 12 for a past year, none for the future", () => {
    expect(monthsOfYear(2026, now)).toHaveLength(9);
    expect(monthsOfYear(2025, now)).toHaveLength(12);
    expect(monthsOfYear(2027, now)).toHaveLength(0);
  });
});
