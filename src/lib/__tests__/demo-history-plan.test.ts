import { describe, it, expect } from "vitest";
import { paidHistoryMonths, recurringMonthlyExpenses } from "../demo-history-plan";
import { buildLedger } from "../rent-ledger";

const d = (s: string) => new Date(`${s}T00:00:00`);

describe("paidHistoryMonths", () => {
  it("bills every month from lease start to the first seeded month, at the rent that applied then", () => {
    const months = paidHistoryMonths(
      {
        leaseStart: d("2025-10-01"),
        monthlyRent: 85000,
        serviceCharge: 8000,
        paymentFrequency: null,
        rentHistory: [
          { monthlyRent: 80000, effectiveDate: d("2025-01-01") },
          { monthlyRent: 85000, effectiveDate: d("2026-01-01") },
        ],
      },
      d("2026-08-01"),
    );
    expect(months).toHaveLength(10); // Oct 2025 – Jul 2026
    expect(months[0]).toEqual({ year: 2025, month: 9, rent: 80000, serviceCharge: 8000 });
    expect(months[3]).toEqual({ year: 2026, month: 0, rent: 85000, serviceCharge: 8000 });
  });

  it("follows a quarterly schedule — one bill per quarter for three months", () => {
    const months = paidHistoryMonths(
      { leaseStart: d("2025-10-15"), monthlyRent: 1000, serviceCharge: 100, paymentFrequency: "QUARTERLY", rentHistory: [] },
      d("2026-07-01"),
    );
    expect(months.map((m) => m.month)).toEqual([9, 0, 3]); // Oct, Jan, Apr
    expect(months[0]).toMatchObject({ rent: 3000, serviceCharge: 300 });
  });

  it("leaves the tenant ledger with no arrears for the back-filled months", () => {
    const tenant = {
      id: "t",
      leaseStart: d("2025-10-01"),
      monthlyRent: 50000,
      serviceCharge: 5000,
      paymentFrequency: null,
      rentHistory: [{ monthlyRent: 47000, effectiveDate: d("2025-01-01") }, { monthlyRent: 50000, effectiveDate: d("2026-01-01") }],
    };
    const months = paidHistoryMonths(tenant, d("2026-08-01"));
    const entries = months.map((m) => ({ type: "LONGTERM_RENT", date: new Date(m.year, m.month, 3), grossAmount: m.rent + m.serviceCharge, tenantId: "t" }));
    const ledger = buildLedger(tenant, entries, d("2026-07-20"));
    expect(ledger.every((r) => r.shortfall === 0)).toBe(true);
  });

  it("nothing before a lease that starts in the seeded window", () => {
    expect(paidHistoryMonths({ leaseStart: d("2026-08-10"), monthlyRent: 1, serviceCharge: 0, paymentFrequency: null, rentHistory: [] }, d("2026-08-01"))).toEqual([]);
  });
});

describe("recurringMonthlyExpenses", () => {
  it("keeps costs seen in two or more months, drops one-offs", () => {
    const rows = recurringMonthlyExpenses([
      { category: "SECURITY", description: "Guards", amount: 45000, date: d("2026-08-01") },
      { category: "SECURITY", description: "Guards", amount: 45000, date: d("2026-09-01") },
      { category: "INSURANCE", description: "Annual premium", amount: 90000, date: d("2026-08-12") },
      { category: "CLEANER", description: "Cleaning", amount: 22000, date: d("2026-08-28") },
      { category: "CLEANER", description: "Cleaning", amount: 22000, date: d("2026-09-28") },
    ]);
    expect(rows.map((r) => r.category).sort()).toEqual(["CLEANER", "SECURITY"]);
    expect(rows.find((r) => r.category === "CLEANER")!.day).toBe(28);
  });
});
