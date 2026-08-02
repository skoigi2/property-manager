import { describe, it, expect } from "vitest";
import { computeVendorStatement } from "../vendor-statement";

const inv = (id: string, date: string, amount: number, extra = {}) => ({
  id, date, amount, ...extra,
});
const pay = (id: string, paymentDate: string, amount: number, extra = {}) => ({
  id, paymentDate, amount, ...extra,
});

describe("computeVendorStatement", () => {
  it("merges invoices and payments date-sorted with a running balance", () => {
    const result = computeVendorStatement(
      [inv("e1", "2026-01-05", 10000), inv("e2", "2026-02-10", 4000)],
      [pay("p1", "2026-01-20", 6000)]
    );
    expect(result.openingBalance).toBe(0);
    expect(result.lines.map((l) => [l.type, l.balance])).toEqual([
      ["INVOICE", 10000],
      ["PAYMENT", 4000],
      ["INVOICE", 8000],
    ]);
    expect(result.totals).toEqual({ invoiced: 14000, paid: 6000, outstanding: 8000 });
  });

  it("orders a same-day settlement charge-then-payment", () => {
    const result = computeVendorStatement(
      [inv("e1", "2026-03-01", 5000)],
      [pay("p1", "2026-03-01", 5000)]
    );
    expect(result.lines.map((l) => l.type)).toEqual(["INVOICE", "PAYMENT"]);
    expect(result.lines[1].balance).toBe(0);
  });

  it("rolls pre-range activity into the opening balance", () => {
    const result = computeVendorStatement(
      [inv("e1", "2025-11-01", 10000), inv("e2", "2026-01-15", 3000)],
      [pay("p1", "2025-12-01", 4000)],
      new Date("2026-01-01"),
      new Date("2026-01-31T23:59:59.999Z")
    );
    // Opening = 10000 invoiced − 4000 paid before Jan
    expect(result.openingBalance).toBe(6000);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].balance).toBe(9000);
    expect(result.totals).toEqual({ invoiced: 3000, paid: 0, outstanding: 9000 });
  });

  it("excludes activity after the range end", () => {
    const result = computeVendorStatement(
      [inv("e1", "2026-01-10", 2000), inv("e2", "2026-06-10", 9999)],
      [],
      null,
      new Date("2026-01-31T23:59:59.999Z")
    );
    expect(result.lines).toHaveLength(1);
    expect(result.totals.invoiced).toBe(2000);
  });

  it("handles one payment spanning two invoices", () => {
    // Cheque of 15 000 settles a 10 000 and (partially) a 6 000 invoice.
    const result = computeVendorStatement(
      [inv("e1", "2026-04-01", 10000), inv("e2", "2026-04-15", 6000)],
      [pay("p1", "2026-04-20", 15000, { paymentMethod: "CHEQUE", reference: "CHQ-042" })]
    );
    expect(result.lines.map((l) => l.balance)).toEqual([10000, 16000, 1000]);
    expect(result.totals).toEqual({ invoiced: 16000, paid: 15000, outstanding: 1000 });
    expect(result.lines[2].reference).toBe("CHQ-042");
  });

  it("unallocated credit shows as a negative balance owed", () => {
    const result = computeVendorStatement(
      [inv("e1", "2026-05-01", 3000)],
      [pay("p1", "2026-05-02", 5000)]
    );
    expect(result.totals.outstanding).toBe(-2000);
  });

  it("labels synthetic manual-payment lines with the provided description", () => {
    const result = computeVendorStatement(
      [inv("e1", "2026-01-05", 800)],
      [pay("manual-e1", "2026-01-06", 800, { description: "Paid on expense — Pool chemicals" })]
    );
    expect(result.lines[1].description).toBe("Paid on expense — Pool chemicals");
    expect(result.totals.outstanding).toBe(0);
  });

  it("rounds running balances to 2dp", () => {
    const result = computeVendorStatement(
      [inv("e1", "2026-01-01", 10.1), inv("e2", "2026-01-02", 20.2)],
      [pay("p1", "2026-01-03", 30.3)]
    );
    expect(result.totals.outstanding).toBe(0);
  });
});
