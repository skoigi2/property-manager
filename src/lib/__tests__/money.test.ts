import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { round2, toNumber, decimalsToNumbers } from "@/lib/money";

const D = (v: string | number) => new Prisma.Decimal(v);

describe("round2", () => {
  it("rounds to 2dp", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.004)).toBe(10);
    expect(round2(85000)).toBe(85000);
  });
});

describe("toNumber", () => {
  it("converts Decimal, passes through number, preserves null", () => {
    expect(toNumber(D("85000.50"))).toBe(85000.5);
    expect(toNumber(123.45)).toBe(123.45);
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

describe("decimalsToNumbers", () => {
  it("converts a bare Decimal", () => {
    expect(decimalsToNumbers(D("99.99") as unknown)).toBe(99.99);
  });

  it("deep-converts nested objects and arrays (the Prisma result shape)", () => {
    const result = decimalsToNumbers({
      id: "x",
      grossAmount: D("85000.00"),
      tenant: { name: "J", monthlyRent: D("120000.50") },
      lineItems: [{ amount: D("1.10") }, { amount: D("2.20") }],
      _sum: { amount: D("3.30"), vatAmount: null },
    });
    expect(result.grossAmount).toBe(85000);
    expect(result.tenant.monthlyRent).toBe(120000.5);
    expect(result.lineItems.map((l) => l.amount)).toEqual([1.1, 2.2]);
    expect(result._sum.amount).toBe(3.3);
    expect(result._sum.vatAmount).toBeNull();
  });

  it("preserves Dates, strings, booleans and null", () => {
    const d = new Date("2026-06-01");
    const r = decimalsToNumbers({ when: d, name: "a", ok: true, gone: null });
    expect(r.when).toBe(d);
    expect(r.name).toBe("a");
    expect(r.ok).toBe(true);
    expect(r.gone).toBeNull();
  });

  it("is exact for 2dp currency values", () => {
    // numeric(14,2) max-ish magnitude still exactly representable as a double
    expect(decimalsToNumbers(D("999999999999.99") as unknown)).toBe(999999999999.99);
  });
});
