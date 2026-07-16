import { describe, it, expect } from "vitest";
import { allocatePayments } from "../ledger-allocation";

describe("allocatePayments", () => {
  it("marks every month PAID for an on-time monthly payer", () => {
    const rows = allocatePayments([
      { expected: 350000, received: 350000 },
      { expected: 350000, received: 350000 },
      { expected: 350000, received: 350000 },
    ]);
    expect(rows.map((r) => r.status)).toEqual(["PAID", "PAID", "PAID"]);
    expect(rows.map((r) => r.balance)).toEqual([0, 0, 0]);
    expect(rows.every((r) => r.shortfall === 0)).toBe(true);
  });

  it("quarterly prepayment covers the following months (the screenshot case)", () => {
    // Apr: 1,155,000 covering Apr–Jun (350k rent + a 105k extra), May/Jun: no cash in
    const rows = allocatePayments([
      { expected: 350000, received: 1155000 }, // Apr
      { expected: 350000, received: 0 },       // May
      { expected: 350000, received: 0 },       // Jun
    ]);
    expect(rows.map((r) => r.status)).toEqual(["PAID", "PAID", "PAID"]);
    expect(rows[0].allocated).toBe(350000);
    expect(rows[2].balance).toBe(105000); // surplus carries forward
    expect(rows.every((r) => r.shortfall === 0)).toBe(true);
  });

  it("a late catch-up payment clears the older month", () => {
    // Jan missed, Feb pays double — Jan is retroactively covered
    const rows = allocatePayments([
      { expected: 350000, received: 0 },
      { expected: 350000, received: 700000 },
    ]);
    expect(rows.map((r) => r.status)).toEqual(["PAID", "PAID"]);
    expect(rows[1].balance).toBe(0);
  });

  it("genuine deficit surfaces on the most recent months", () => {
    // Paid Jan+Feb only; Mar & Apr owed
    const rows = allocatePayments([
      { expected: 350000, received: 350000 },
      { expected: 350000, received: 350000 },
      { expected: 350000, received: 0 },
      { expected: 350000, received: 0 },
    ]);
    expect(rows.map((r) => r.status)).toEqual(["PAID", "PAID", "UNPAID", "UNPAID"]);
    expect(rows[3].balance).toBe(-700000);
    expect(rows.reduce((s, r) => s + r.shortfall, 0)).toBe(700000);
  });

  it("partial coverage yields PARTIAL on the boundary month", () => {
    const rows = allocatePayments([
      { expected: 350000, received: 500000 },
      { expected: 350000, received: 0 },
    ]);
    expect(rows[0].status).toBe("PAID");
    expect(rows[1].status).toBe("PARTIAL");
    expect(rows[1].allocated).toBe(150000);
    expect(rows[1].shortfall).toBe(200000);
  });

  it("applies the 1% tolerance for near-full payments", () => {
    const rows = allocatePayments([{ expected: 350000, received: 347000 }]);
    expect(rows[0].status).toBe("PAID");
  });

  it("months with zero expected are PAID and pass funds through", () => {
    const rows = allocatePayments([
      { expected: 0, received: 0 },
      { expected: 350000, received: 350000 },
    ]);
    expect(rows.map((r) => r.status)).toEqual(["PAID", "PAID"]);
  });

  it("handles varying expected amounts (rent escalation mid-range)", () => {
    const rows = allocatePayments([
      { expected: 300000, received: 300000 },
      { expected: 350000, received: 300000 }, // paid old rate after escalation
    ]);
    expect(rows[1].status).toBe("PARTIAL");
    expect(rows[1].shortfall).toBe(50000);
  });

  it("returns an empty array for no months", () => {
    expect(allocatePayments([])).toEqual([]);
  });
});
