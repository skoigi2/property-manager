import { describe, it, expect } from "vitest";
import {
  sumAllocations,
  validateAllocations,
  unallocatedRemainder,
  waterfallLineItemPayments,
} from "../vendor-payments";
import { calcExpensePayment } from "../calculations";

describe("validateAllocations", () => {
  it("accepts allocations summing to less than the payment", () => {
    expect(
      validateAllocations(10000, [
        { expenseEntryId: "e1", amount: 6000 },
        { expenseEntryId: "e2", amount: 3000 },
      ])
    ).toBeNull();
  });

  it("accepts allocations summing to exactly the payment", () => {
    expect(
      validateAllocations(10000, [
        { expenseEntryId: "e1", amount: 6000 },
        { expenseEntryId: "e2", amount: 4000 },
      ])
    ).toBeNull();
  });

  it("rejects allocations exceeding the payment amount", () => {
    expect(
      validateAllocations(10000, [
        { expenseEntryId: "e1", amount: 6000 },
        { expenseEntryId: "e2", amount: 4001 },
      ])
    ).toMatch(/exceeds/i);
  });

  it("tolerates float artifacts at 2dp", () => {
    expect(
      validateAllocations(99.99, [
        { expenseEntryId: "e1", amount: 33.33 },
        { expenseEntryId: "e2", amount: 33.33 },
        { expenseEntryId: "e3", amount: 33.33 },
      ])
    ).toBeNull();
  });

  it("rejects zero and negative allocation amounts", () => {
    expect(validateAllocations(100, [{ expenseEntryId: "e1", amount: 0 }])).toMatch(/greater than zero/i);
    expect(validateAllocations(100, [{ expenseEntryId: "e1", amount: -5 }])).toMatch(/greater than zero/i);
  });

  it("rejects duplicate expense ids", () => {
    expect(
      validateAllocations(100, [
        { expenseEntryId: "e1", amount: 40 },
        { expenseEntryId: "e1", amount: 40 },
      ])
    ).toMatch(/duplicate/i);
  });
});

describe("unallocatedRemainder", () => {
  it("returns the credit left on the payment", () => {
    expect(unallocatedRemainder(10000, [{ amount: 6000 }, { amount: 3000 }])).toBe(1000);
  });
  it("never goes negative", () => {
    expect(unallocatedRemainder(100, [{ amount: 150 }])).toBe(0);
  });
});

describe("amountPaid recompute (allocation-sum as source of truth)", () => {
  it("allocation sum drives calcExpensePayment for a plain expense", () => {
    const paid = sumAllocations([{ amount: 4000 }, { amount: 2500 }]);
    const pay = calcExpensePayment({ amount: 10000, amountPaid: paid });
    expect(pay.paid).toBe(6500);
    expect(pay.outstanding).toBe(3500);
    expect(pay.status).toBe("PARTIAL");
  });

  it("fully-allocated expense reads PAID", () => {
    const paid = sumAllocations([{ amount: 10000 }]);
    const pay = calcExpensePayment({ amount: 10000, amountPaid: paid });
    expect(pay.status).toBe("PAID");
    expect(pay.outstanding).toBe(0);
  });
});

describe("waterfallLineItemPayments", () => {
  const items = [
    { id: "a", amount: 5000 },
    { id: "b", amount: 3000 },
    { id: "c", amount: 2000 },
  ];

  it("fills items in order until the total is exhausted", () => {
    const result = waterfallLineItemPayments(items, 6500);
    expect(result).toEqual([
      { id: "a", amountPaid: 5000, paymentStatus: "PAID" },
      { id: "b", amountPaid: 1500, paymentStatus: "PARTIAL" },
      { id: "c", amountPaid: 0, paymentStatus: "UNPAID" },
    ]);
  });

  it("keeps calcExpensePayment consistent for line-item expenses", () => {
    const lineItems = waterfallLineItemPayments(items, 6500);
    const pay = calcExpensePayment({ amount: 10000, amountPaid: 6500, lineItems });
    expect(pay.paid).toBe(6500);
    expect(pay.status).toBe("PARTIAL");
  });

  it("zero total resets every item to UNPAID (payment deleted)", () => {
    const result = waterfallLineItemPayments(items, 0);
    expect(result.every((li) => li.amountPaid === 0 && li.paymentStatus === "UNPAID")).toBe(true);
  });

  it("overpayment caps each item at its own amount", () => {
    const result = waterfallLineItemPayments(items, 99999);
    expect(result.map((li) => li.amountPaid)).toEqual([5000, 3000, 2000]);
    expect(result.every((li) => li.paymentStatus === "PAID")).toBe(true);
  });
});
