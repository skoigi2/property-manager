import { describe, it, expect } from "vitest";
import { computeArrears, buildLedger, type LedgerTenant, type LedgerEntry } from "../rent-ledger";

// Fixed "today" keeps every case deterministic.
const TODAY = new Date(2026, 6, 15); // 15 Jul 2026

const tenant = (over: Partial<LedgerTenant> = {}): LedgerTenant => ({
  id: "t1",
  unitId: "u1",
  leaseStart: new Date(2026, 0, 1), // 1 Jan 2026
  leaseEnd: null,
  monthlyRent: 10000,
  serviceCharge: 0,
  paymentFrequency: null,
  rentHistory: [],
  ...over,
});

const rent = (date: Date, grossAmount: number, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  type: "LONGTERM_RENT",
  date,
  grossAmount,
  tenantId: "t1",
  unitId: "u1",
  ...over,
});

describe("computeArrears", () => {
  it("monthly payer: pooled receipts cover oldest months first", () => {
    // Jan–Jul 2026 = 7 months × 10 000 expected; 15 000 received total.
    const s = computeArrears(tenant(), [rent(new Date(2026, 0, 5), 10000), rent(new Date(2026, 2, 5), 5000)], 0, TODAY);
    expect(s.months).toHaveLength(7);
    expect(s.months[0].isPaid).toBe(true);          // Jan fully covered
    expect(s.months[1].isPartial).toBe(true);       // Feb half covered
    expect(s.totalArrears).toBe(7 * 10000 - 15000); // 55 000
    expect(s.totalMonthsOwed).toBe(6);              // Feb..Jul not fully paid
    expect(s.hasArrears).toBe(true);
  });

  it("annual payer: one ledger row per billing period at the full amount", () => {
    const s = computeArrears(tenant({ leaseStart: new Date(2024, 5, 15), paymentFrequency: "ANNUAL" }), [], 0, TODAY);
    // Billing months: Jun 2024, Jun 2025, Jun 2026 — fillers dropped.
    expect(s.months).toHaveLength(3);
    expect(s.months.every((m) => m.expected === 120000)).toBe(true);
    expect(s.totalArrears).toBe(360000);
    // Month-equivalents: 3 unpaid annual periods = 36 months.
    expect(s.totalMonthsOwed).toBe(36);
  });

  it("quarterly prepayment covers the whole period without false arrears", () => {
    const s = computeArrears(
      tenant({ paymentFrequency: "QUARTERLY" }),
      [
        rent(new Date(2026, 0, 3), 30000), // Q1
        rent(new Date(2026, 3, 2), 30000), // Q2
        rent(new Date(2026, 6, 1), 30000), // Q3
      ],
      0,
      TODAY,
    );
    expect(s.hasArrears).toBe(false);
    expect(s.totalMonthsOwed).toBe(0);
    expect(s.months.every((m) => m.isPaid)).toBe(true);
  });

  it("charges late interest on unpaid shortfalls when a rate is set", () => {
    const s = computeArrears(tenant(), [], 12, TODAY);
    expect(s.totalInterest).toBeGreaterThan(0);
    // Newest month (Jul) is barely overdue; oldest (Jan) accrues the most.
    expect(s.months[0].interest).toBeGreaterThan(s.months[6].interest);
  });

  it("ignores entries for other tenants/units and non-rent types", () => {
    const s = computeArrears(
      tenant(),
      [
        rent(new Date(2026, 0, 5), 10000, { tenantId: "other", unitId: "other-unit" }),
        rent(new Date(2026, 0, 5), 10000, { type: "DEPOSIT" }),
      ],
      0,
      TODAY,
    );
    expect(s.months[0].totalPaid).toBe(0);
    expect(s.lastPaymentDate).toBeNull();
  });

  it("respects RentHistory for past months", () => {
    const s = computeArrears(
      tenant({
        monthlyRent: 12000,
        rentHistory: [
          { monthlyRent: 10000, effectiveDate: new Date(2026, 0, 1) },
          { monthlyRent: 12000, effectiveDate: new Date(2026, 3, 1) },
        ],
      }),
      [],
      0,
      TODAY,
    );
    expect(s.months[0].expected).toBe(10000); // Jan at the old rate
    expect(s.months[3].expected).toBe(12000); // Apr onwards escalated
  });
});

describe("buildLedger", () => {
  it("returns [] without a lease start", () => {
    expect(buildLedger(null, [], TODAY)).toEqual([]);
    expect(buildLedger(tenant({ leaseStart: null }), [], TODAY)).toEqual([]);
  });

  it("monthly payer: one row per month, newest first, service charge included", () => {
    const rows = buildLedger(tenant({ serviceCharge: 500 }), [rent(new Date(2026, 0, 5), 10500)], TODAY);
    expect(rows).toHaveLength(7); // Jan–Jul 2026
    expect(rows[0].monthLabel).toBe("Jul 2026");
    expect(rows[rows.length - 1].monthLabel).toBe("Jan 2026");
    expect(rows.every((r) => r.expected === 10500)).toBe(true);
    expect(rows[rows.length - 1].status).toBe("PAID");
    expect(rows[rows.length - 1].payments).toHaveLength(1);
  });

  it("annual payer: filler months dropped, billing row carries rent + service × 12", () => {
    const rows = buildLedger(
      tenant({ leaseStart: new Date(2025, 5, 1), paymentFrequency: "ANNUAL", serviceCharge: 500 }),
      [],
      TODAY,
    );
    // Billing months: Jun 2025, Jun 2026 only.
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.expected === 120000 + 6000)).toBe(true);
    expect(rows[0].monthLabel).toBe("Jun 2026");
  });

  it("stops at lease end for vacated tenants", () => {
    const rows = buildLedger(tenant({ leaseEnd: new Date(2026, 2, 31) }), [], TODAY);
    expect(rows).toHaveLength(3); // Jan–Mar 2026
    expect(rows[0].monthLabel).toBe("Mar 2026");
  });
});
