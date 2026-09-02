import { describe, it, expect } from "vitest";
import { resolveExpenseTargets, distinctPropertyIds } from "../expense-scope";
import { expenseEntrySchema } from "../validations";
import { calcLinePaymentStatus } from "../calculations";

describe("resolveExpenseTargets", () => {
  it("PORTFOLIO drops every target id, even stale ones from a scope switch", () => {
    expect(resolveExpenseTargets("PORTFOLIO", { propertyId: "p1", unitIds: ["u1"], unitId: "u1" }))
      .toEqual({ unitId: undefined, unitIds: [], propertyId: undefined });
  });

  it("PROPERTY keeps only the property and treats '' as unset", () => {
    expect(resolveExpenseTargets("PROPERTY", { propertyId: "", unitIds: ["u1"] }).propertyId).toBeUndefined();
    expect(resolveExpenseTargets("PROPERTY", { propertyId: "p1", unitIds: ["u1"] }))
      .toEqual({ unitId: undefined, unitIds: [], propertyId: "p1" });
  });

  it("UNIT dedupes unit ids, sets unitId only for a single unit, and never keeps propertyId", () => {
    expect(resolveExpenseTargets("UNIT", { unitIds: ["u1", "u1", "u2"], propertyId: "p1" }))
      .toEqual({ unitId: undefined, unitIds: ["u1", "u2"], propertyId: undefined });
    expect(resolveExpenseTargets("UNIT", { unitIds: ["u1"] }).unitId).toBe("u1");
  });

  it("UNIT promotes a lone legacy unitId when unitIds is empty", () => {
    expect(resolveExpenseTargets("UNIT", { unitId: "u9", unitIds: [] }))
      .toEqual({ unitId: "u9", unitIds: ["u9"], propertyId: undefined });
  });

  it("distinctPropertyIds flags a cross-property split", () => {
    expect(distinctPropertyIds([{ propertyId: "a" }, { propertyId: "a" }])).toEqual(["a"]);
    expect(distinctPropertyIds([{ propertyId: "a" }, { propertyId: "b" }])).toHaveLength(2);
  });
});

describe("calcLinePaymentStatus", () => {
  it("derives UNPAID / PARTIAL / PAID from the paid amount", () => {
    expect(calcLinePaymentStatus(100, 0)).toBe("UNPAID");
    expect(calcLinePaymentStatus(100, null)).toBe("UNPAID");
    expect(calcLinePaymentStatus(100, 40)).toBe("PARTIAL");
    expect(calcLinePaymentStatus(100, 100)).toBe("PAID");
    expect(calcLinePaymentStatus(100, 99.999)).toBe("PAID");
  });
});

describe("expenseEntrySchema guards", () => {
  const base = { date: "2026-08-01", category: "MAINTENANCE", amount: 100 };
  const fieldErrors = (r: ReturnType<typeof expenseEntrySchema.safeParse>) =>
    r.success ? {} : r.error.flatten().fieldErrors;

  it("rejects a blank category and a zero amount with human messages", () => {
    const r = expenseEntrySchema.safeParse({ ...base, scope: "PORTFOLIO", category: "", amount: "" });
    expect(r.success).toBe(false);
    expect(fieldErrors(r).category?.[0]).toBe("Pick a category");
    expect(fieldErrors(r).amount?.[0]).toBe("Amount must be greater than 0");
  });

  it("requires a property for PROPERTY scope and a unit for UNIT scope", () => {
    const p = expenseEntrySchema.safeParse({ ...base, scope: "PROPERTY", propertyId: "" });
    expect(fieldErrors(p).propertyId?.[0]).toMatch(/Pick the property/);

    const u = expenseEntrySchema.safeParse({ ...base, scope: "UNIT", unitIds: [] });
    expect(fieldErrors(u).unitIds?.[0]).toMatch(/at least one unit/);

    expect(expenseEntrySchema.safeParse({ ...base, scope: "UNIT", unitIds: ["u1"] }).success).toBe(true);
    expect(expenseEntrySchema.safeParse({ ...base, scope: "PORTFOLIO" }).success).toBe(true);
  });

  it("rejects overpayment and a payment date with nothing paid", () => {
    const over = expenseEntrySchema.safeParse({ ...base, scope: "PORTFOLIO", amountPaid: 150 });
    expect(fieldErrors(over).amountPaid?.[0]).toMatch(/cannot exceed/);
    const dated = expenseEntrySchema.safeParse({ ...base, scope: "PORTFOLIO", amountPaid: 0, paymentDate: "2026-08-02" });
    expect(fieldErrors(dated).paymentDate?.[0]).toMatch(/needs an amount paid/);
    // Petty cash settles the bill itself, so a date without a typed amount is fine.
    expect(expenseEntrySchema.safeParse({ ...base, scope: "PORTFOLIO", paidFromPettyCash: true, paymentDate: "2026-08-02" }).success).toBe(true);
  });

  it("leaves line-item expenses alone for the parent payment checks", () => {
    const r = expenseEntrySchema.safeParse({
      ...base, scope: "PORTFOLIO", amountPaid: 999, paymentDate: "2026-08-02",
      lineItems: [{ category: "LABOUR", amount: 100 }],
    });
    expect(r.success).toBe(true);
  });
});
