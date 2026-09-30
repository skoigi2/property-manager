import { describe, it, expect } from "vitest";
import {
  serviceChargeYear,
  unitWeights,
  budgetVsActual,
  occupiedDays,
  serviceChargePaidOnInvoice,
  yearEndStatement,
  suggestedMonthlyCharge,
  type ScInvoice,
  type ScUnit,
} from "../service-charge";

const d = (s: string) => new Date(`${s}T00:00:00`);

const units: ScUnit[] = [
  { id: "a", unitNumber: "101", sizeSqm: 50, currentCharge: 5000 },
  { id: "b", unitNumber: "102", sizeSqm: 100, currentCharge: 10000 },
  { id: "c", unitNumber: "103", sizeSqm: null, currentCharge: 0 },
];

const inv = (over: Partial<ScInvoice>): ScInvoice => ({
  id: "i",
  invoiceNumber: "INV-1",
  tenantId: "t1",
  periodYear: 2025,
  periodMonth: 1,
  status: "SENT",
  paidAmount: 0,
  serviceChargeBudgetId: null,
  rentAmount: 0,
  serviceCharge: 0,
  otherCharges: 0,
  lateFeeAmount: 0,
  ...over,
});

describe("serviceChargeYear", () => {
  it("calendar year and a year starting mid-year", () => {
    const y = serviceChargeYear(2025);
    expect(y.days).toBe(365);
    expect(y.label).toBe("2025");
    const j = serviceChargeYear(2025, 7);
    expect(j.from.getMonth()).toBe(6);
    expect(j.to.getFullYear()).toBe(2026);
    expect(j.label).toBe("Jul 2025 – Jun 2026");
  });
});

describe("unitWeights", () => {
  it("floor area, a missing size counts at the average and is warned", () => {
    const w = unitWeights(units, "FLOOR_AREA");
    // 50 / 100 / 75 (avg) → 225
    expect(w.share.a).toBeCloseTo(50 / 225);
    expect(w.share.c).toBeCloseTo(75 / 225);
    expect(w.warnings[0]).toMatch(/103/);
    expect(Object.values(w.share).reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });

  it("no sizes at all falls back to equal shares", () => {
    const w = unitWeights(units.map((u) => ({ ...u, sizeSqm: null })), "FLOOR_AREA");
    expect(w.basisUsed).toBe("EQUAL");
    expect(w.share.b).toBeCloseTo(1 / 3);
  });

  it("current charge gives a vacant unit no share", () => {
    const w = unitWeights(units, "CURRENT_CHARGE");
    expect(w.share.b).toBeCloseTo(2 / 3);
    expect(w.share.c).toBe(0);
    expect(w.warnings[0]).toMatch(/103/);
  });

  it("suggested monthly charge recovers the unit's budget share", () => {
    expect(suggestedMonthlyCharge(1_200_000, 0.25)).toBe(25_000);
  });
});

describe("budgetVsActual", () => {
  it("budget to date is pro-rata to the days elapsed", () => {
    const y = serviceChargeYear(2025);
    const r = budgetVsActual(
      [{ category: "SECURITY", amount: 365_000 }, { category: "CLEANER", amount: 73_000 }],
      { SECURITY: 120_000 },
      y,
      d("2025-04-10"), // 100 days
    );
    expect(r.rows[0].budgetToDate).toBe(100_000);
    expect(r.rows[0].variance).toBe(20_000);
    expect(r.rows[1].actual).toBe(0);
    expect(r.totals.budget).toBe(438_000);
    expect(r.rows[0].pctUsed).toBeCloseTo(120 / 365);
  });

  it("a finished year uses the whole budget", () => {
    const r = budgetVsActual([{ category: "SECURITY", amount: 100 }], {}, serviceChargeYear(2025), d("2026-03-01"));
    expect(r.rows[0].budgetToDate).toBe(100);
    expect(r.fractionElapsed).toBe(1);
  });
});

describe("occupancy", () => {
  const y = serviceChargeYear(2025);
  it("clips to the year and counts both end days", () => {
    expect(occupiedDays({ leaseStart: d("2024-06-01"), endDate: null }, y, d("2026-01-15"))).toBe(365);
    expect(occupiedDays({ leaseStart: d("2025-07-01"), endDate: null }, y, d("2026-01-15"))).toBe(184);
    expect(occupiedDays({ leaseStart: d("2024-01-01"), endDate: d("2025-01-31") }, y, d("2026-01-15"))).toBe(31);
    expect(occupiedDays({ leaseStart: d("2026-01-01"), endDate: null }, y, d("2026-01-15"))).toBe(0);
  });
});

describe("service charge paid", () => {
  it("is the service charge's share of what reached the rent side", () => {
    // rent 40k + sc 10k = 50k rent side; 25k paid → half the SC.
    expect(serviceChargePaidOnInvoice(inv({ rentAmount: 40_000, serviceCharge: 10_000, paidAmount: 25_000 }))).toBe(5_000);
    expect(serviceChargePaidOnInvoice(inv({ rentAmount: 40_000, serviceCharge: 10_000, status: "PAID", paidAmount: null }))).toBe(10_000);
    // Water is paid after the rent side, so it doesn't dilute the SC.
    expect(serviceChargePaidOnInvoice(inv({ rentAmount: 40_000, serviceCharge: 10_000, waterAmount: 2_000, paidAmount: 50_000 }))).toBe(10_000);
  });
});

describe("yearEndStatement", () => {
  const y = serviceChargeYear(2025);
  const weights = unitWeights(units.slice(0, 2), "FLOOR_AREA"); // a = 1/3, b = 2/3
  const monthly = (tenantId: string, sc: number, months: number[], extra: Partial<ScInvoice> = {}) =>
    months.map((m) => inv({ id: `${tenantId}-${m}`, tenantId, periodMonth: m, rentAmount: 30_000, serviceCharge: sc, status: "PAID", ...extra }));

  it("share by unit and days, balance against billed, vacant days to the landlord", () => {
    const s = yearEndStatement({
      year: y,
      asOf: d("2026-02-01"),
      actualTotal: 365_000 * 3, // 3,000 a day across the block
      units: units.slice(0, 2),
      weights,
      tenancies: [
        // a: occupied all year
        { tenantId: "t1", tenantName: "Ann", email: null, unitId: "a", leaseStart: d("2024-01-01"), endDate: null },
        // b: in from 1 Jul (184 days); vacant 181 days
        { tenantId: "t2", tenantName: "Ben", email: null, unitId: "b", leaseStart: d("2025-07-01"), endDate: null },
      ],
      invoices: [...monthly("t1", 25_000, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), ...monthly("t2", 50_000, [7, 8, 9, 10, 11, 12])],
    });
    expect(s.yearEnded).toBe(true);
    const ann = s.rows.find((r) => r.tenantId === "t1")!;
    const ben = s.rows.find((r) => r.tenantId === "t2")!;
    expect(ann.share).toBe(365_000); // 1,000/day × 365
    expect(ann.billed).toBe(300_000);
    expect(ann.balance).toBe(65_000); // charge
    expect(ben.share).toBe(368_000); // 2,000/day × 184
    expect(ben.balance).toBe(68_000);
    expect(s.landlord).toEqual([{ unitId: "b", unitNumber: "102", vacantDays: 181, share: 362_000 }]);
    // Everything is accounted for: tenants + landlord = actual.
    expect(s.totals.share + s.totals.landlord).toBe(s.actualTotal);
  });

  it("credits, cancelled and balancing invoices, and an interim (unfinished) year", () => {
    const s = yearEndStatement({
      year: y,
      asOf: d("2025-06-30"), // 181 days in
      actualTotal: 181_000,
      units: units.slice(0, 1),
      weights: unitWeights(units.slice(0, 1), "FLOOR_AREA"),
      tenancies: [{ tenantId: "t1", tenantName: "Ann", email: null, unitId: "a", leaseStart: d("2024-01-01"), endDate: null }],
      invoices: [
        ...monthly("t1", 40_000, [1, 2, 3, 4, 5, 6]),
        inv({ id: "x", tenantId: "t1", periodMonth: 3, serviceCharge: 40_000, status: "CANCELLED" }),
        inv({ id: "bal", invoiceNumber: "INV-BAL", tenantId: "t1", periodMonth: 2, serviceCharge: 9_999, serviceChargeBudgetId: "b1", status: "DRAFT" }),
        ...monthly("t1", 40_000, [7]), // after asOf — not billed yet
      ],
    });
    expect(s.yearEnded).toBe(false);
    expect(s.daysCovered).toBe(181);
    const r = s.rows[0];
    expect(r.share).toBe(181_000);
    expect(r.billed).toBe(240_000);
    expect(r.balance).toBe(-59_000); // credit
    expect(r.balancingInvoice?.invoiceNumber).toBe("INV-BAL");
    expect(s.totals.credits).toBe(59_000);
    expect(s.totals.charges).toBe(0);
  });
});
