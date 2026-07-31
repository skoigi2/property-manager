import { describe, it, expect } from "vitest";
import {
  calcPettyCashBalance,
  calcPettyCashTotal,
  calcExpensePayment,
  calcNetIncome,
  calcOccupancyRate,
  calcLateInterest,
  calcUnitSummary,
} from "@/lib/calculations";

import type { PettyCashLike } from "@/lib/calculations";

const pc = (over: Partial<PettyCashLike>): PettyCashLike =>
  ({ type: "IN", amount: 0, status: "APPROVED", ...over });

describe("calcPettyCashBalance / calcPettyCashTotal", () => {
  it("accumulates IN as positive and OUT as negative", () => {
    const rows = calcPettyCashBalance([
      pc({ type: "IN", amount: 10000 }),
      pc({ type: "OUT", amount: 3500 }),
      pc({ type: "OUT", amount: 1500 }),
    ]);
    expect(rows.map((r) => r.balance)).toEqual([10000, 6500, 5000]);
    expect(calcPettyCashTotal(rows)).toBe(5000);
  });

  it("ignores PENDING and REJECTED entries", () => {
    const entries = [
      pc({ type: "IN", amount: 10000 }),
      pc({ type: "OUT", amount: 9999, status: "PENDING" }),
      pc({ type: "OUT", amount: 9999, status: "REJECTED" }),
    ];
    const rows = calcPettyCashBalance(entries);
    // Non-approved rows carry the unchanged running balance
    expect(rows.map((r) => r.balance)).toEqual([10000, 10000, 10000]);
    expect(calcPettyCashTotal(entries)).toBe(10000);
  });

  it("returns 0 total for empty input", () => {
    expect(calcPettyCashTotal([])).toBe(0);
  });
});

describe("calcExpensePayment", () => {
  it("derives UNPAID when nothing is paid", () => {
    expect(calcExpensePayment({ amount: 5000 })).toEqual({
      total: 5000,
      paid: 0,
      outstanding: 5000,
      status: "UNPAID",
    });
  });

  it("derives PARTIAL with outstanding balance", () => {
    expect(calcExpensePayment({ amount: 5000, amountPaid: 2000 })).toEqual({
      total: 5000,
      paid: 2000,
      outstanding: 3000,
      status: "PARTIAL",
    });
  });

  it("derives PAID and clamps outstanding at 0 on overpayment", () => {
    const r = calcExpensePayment({ amount: 5000, amountPaid: 6000 });
    expect(r.status).toBe("PAID");
    expect(r.outstanding).toBe(0);
  });

  it("uses line-item amountPaid as source of truth when line items exist", () => {
    const r = calcExpensePayment({
      amount: 1000,
      amountPaid: 999, // must be ignored
      lineItems: [{ amountPaid: 300 }, { amountPaid: null }, { amountPaid: 200 }],
    });
    expect(r.paid).toBe(500);
    expect(r.status).toBe("PARTIAL");
    expect(r.outstanding).toBe(500);
  });

  it("falls back to expense-level amountPaid when lineItems is empty", () => {
    const r = calcExpensePayment({ amount: 1000, amountPaid: 1000, lineItems: [] });
    expect(r.status).toBe("PAID");
  });
});

type ExpenseLike = { amount: number; isSunkCost: boolean; category: string };
const exp = (over: Partial<ExpenseLike>): ExpenseLike =>
  ({ amount: 0, isSunkCost: false, category: "OTHER", ...over });

describe("calcNetIncome", () => {
  it("subtracts commissions and operating expenses, excluding sunk costs", () => {
    const expenses = [
      exp({ amount: 1000 }),
      exp({ amount: 2000 }),
      exp({ amount: 50000, isSunkCost: true }), // capital item — excluded from P&L
    ];
    expect(calcNetIncome(100000, 5000, expenses)).toBe(92000);
  });
});

describe("calcOccupancyRate", () => {
  const booking = (checkIn: string, checkOut: string) =>
    ({ checkIn: new Date(checkIn), checkOut: new Date(checkOut) }) as never;

  it("computes booked nights over the period", () => {
    // 10 booked nights over a 30-day month
    expect(calcOccupancyRate([booking("2026-06-01", "2026-06-11")], 30)).toBeCloseTo(10 / 30);
  });

  it("caps at 100%", () => {
    expect(calcOccupancyRate([booking("2026-06-01", "2026-07-15")], 30)).toBe(1);
  });

  it("returns 0 for a zero-day period or no bookings", () => {
    expect(calcOccupancyRate([], 30)).toBe(0);
    expect(calcOccupancyRate([booking("2026-06-01", "2026-06-05")], 0)).toBe(0);
  });
});

describe("calcLateInterest", () => {
  it("computes simple daily interest", () => {
    // 100,000 at 12% p.a. for 30 days = 100000 * 0.12 / 365 * 30
    expect(calcLateInterest(100000, 12, 30)).toBeCloseTo((100000 * 0.12 * 30) / 365);
  });

  it("returns 0 for non-positive inputs", () => {
    expect(calcLateInterest(0, 12, 30)).toBe(0);
    expect(calcLateInterest(1000, 0, 30)).toBe(0);
    expect(calcLateInterest(1000, 12, 0)).toBe(0);
  });
});

describe("calcUnitSummary", () => {
  it("splits fixed vs variable expenses and excludes sunk costs from P&L", () => {
    const income = [
      { grossAmount: 50000, agentCommission: 2500 },
      { grossAmount: 30000, agentCommission: 0 },
    ];
    const expenses = [
      { category: "SERVICE_CHARGE", amount: 4000, isSunkCost: false },
      { category: "WIFI", amount: 3000, isSunkCost: false },
      { category: "MAINTENANCE", amount: 5000, isSunkCost: false },
      { category: "CAPITAL", amount: 80000, isSunkCost: true },
    ] as never[];

    const s = calcUnitSummary(income, expenses);
    expect(s.grossIncome).toBe(80000);
    expect(s.totalCommissions).toBe(2500);
    expect(s.netRevenue).toBe(77500);
    expect(s.fixedExpenses).toBe(7000);
    expect(s.variableExpenses).toBe(5000);
    expect(s.sunkCosts).toBe(80000);
    expect(s.totalExpenses).toBe(12000);
    expect(s.netProfit).toBe(65500); // sunk cost not deducted
  });
});
