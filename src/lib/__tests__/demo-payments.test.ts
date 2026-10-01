import { describe, it, expect } from "vitest";
import { demoPaymentRows } from "../demo-payments";

const date = new Date("2026-09-03T00:00:00");
const base = { id: "inv", tenantId: "t", rentAmount: 1800, serviceCharge: 250, totalAmount: 2050 };

describe("demoPaymentRows", () => {
  it("books a paid rent invoice as one rent-side receipt of the whole total", () => {
    const rows = demoPaymentRows({ ...base, paidAmount: 2050 }, { unitId: "u", date });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "LONGTERM_RENT", grossAmount: 2050, invoiceId: "inv", tenantId: "t", unitId: "u" });
  });

  it("uses the total when paidAmount isn't set", () => {
    expect(demoPaymentRows(base, { unitId: "u", date })[0].grossAmount).toBe(2050);
  });

  it("splits utilities into tagged receipts, like a real payment", () => {
    const inv = { ...base, waterAmount: 600, electricityAmount: 900, totalAmount: 3550, paidAmount: 3550 };
    const rows = demoPaymentRows(inv, { unitId: "u", date });
    expect(rows.map((r) => [r.type, r.utilityType, r.grossAmount])).toEqual([
      ["LONGTERM_RENT", null, 2050],
      ["UTILITY_RECOVERY", "WATER", 600],
      ["UTILITY_RECOVERY", "ELECTRICITY", 900],
    ]);
  });

  it("continues after earlier payments (utilities added to an invoice whose rent was paid)", () => {
    const inv = { ...base, waterAmount: 600, electricityAmount: 900, totalAmount: 3550, paidAmount: 3100 };
    const rows = demoPaymentRows(inv, { unitId: "u", date, alreadyPaid: 2050 });
    expect(rows.map((r) => [r.utilityType, r.grossAmount])).toEqual([
      ["WATER", 600],
      ["ELECTRICITY", 450],
    ]);
  });

  it("puts the seed's own tax / commission fields on the rent row only", () => {
    const inv = { ...base, waterAmount: 600, totalAmount: 2650 };
    const rows = demoPaymentRows(inv, { unitId: "u", date, rentFields: { taxAmount: 50, taxRate: 0.2 } });
    expect(rows[0]).toMatchObject({ type: "LONGTERM_RENT", taxAmount: 50 });
    expect(rows[1]).not.toHaveProperty("taxAmount");
  });
});
