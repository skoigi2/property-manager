import { describe, it, expect } from "vitest";
import {
  allocateInvoicePayment,
  describeAllocation,
  invoiceHasMoveInLines,
  invoiceLinesTotal,
  invoicePaymentBuckets,
} from "../invoice-payment";

// The 17 Losai move-in invoice (tenancy agreement clause 1.2).
const moveIn = {
  rentAmount: 22000,
  serviceCharge: 3000,
  otherCharges: 0,
  lateFeeAmount: 0,
  depositAmount: 50000,
  leaseFee: 2000,
};

const rentOnly = { rentAmount: 22000, serviceCharge: 3000 };

describe("invoice line helpers", () => {
  it("totals every line", () => {
    expect(invoiceLinesTotal(moveIn)).toBe(77000);
    expect(invoiceLinesTotal(rentOnly)).toBe(25000);
  });

  it("flags move-in lines", () => {
    expect(invoiceHasMoveInLines(moveIn)).toBe(true);
    expect(invoiceHasMoveInLines(rentOnly)).toBe(false);
  });

  it("a rent-only invoice has exactly one LONGTERM_RENT bucket (rent + service charge lumped)", () => {
    expect(invoicePaymentBuckets({ ...rentOnly, lateFeeAmount: 500 })).toEqual([
      { type: "LONGTERM_RENT", amount: 25500 },
    ]);
  });
});

describe("allocateInvoicePayment", () => {
  it("full payment yields one typed entry per non-zero line, in order", () => {
    expect(allocateInvoicePayment(moveIn, 77000)).toEqual([
      { type: "LONGTERM_RENT", amount: 25000 },
      { type: "DEPOSIT", amount: 50000 },
      { type: "LEASE_FEE", amount: 2000 },
    ]);
  });

  it("a short payment fills rent first and leaves the tail unpaid", () => {
    expect(allocateInvoicePayment(moveIn, 40000)).toEqual([
      { type: "LONGTERM_RENT", amount: 25000 },
      { type: "DEPOSIT", amount: 15000 },
    ]);
  });

  it("a second payment continues from where the first stopped", () => {
    expect(allocateInvoicePayment(moveIn, 37000, 40000)).toEqual([
      { type: "DEPOSIT", amount: 35000 },
      { type: "LEASE_FEE", amount: 2000 },
    ]);
  });

  it("rent-only invoices behave as before: one rent entry for the amount", () => {
    expect(allocateInvoicePayment(rentOnly, 25000)).toEqual([{ type: "LONGTERM_RENT", amount: 25000 }]);
    expect(allocateInvoicePayment(rentOnly, 10000)).toEqual([{ type: "LONGTERM_RENT", amount: 10000 }]);
  });

  it("overpayment folds into the last bucket instead of inventing a line", () => {
    expect(allocateInvoicePayment(rentOnly, 26000)).toEqual([{ type: "LONGTERM_RENT", amount: 26000 }]);
    expect(allocateInvoicePayment(moveIn, 78000)).toEqual([
      { type: "LONGTERM_RENT", amount: 25000 },
      { type: "DEPOSIT", amount: 50000 },
      { type: "LEASE_FEE", amount: 3000 },
    ]);
  });

  it("returns nothing for a zero amount", () => {
    expect(allocateInvoicePayment(moveIn, 0)).toEqual([]);
  });

  it("describes the split for a toast", () => {
    const fmt = (n: number) => n.toLocaleString("en-US");
    expect(describeAllocation(allocateInvoicePayment(moveIn, 77000), fmt)).toBe(
      "rent 25,000 · deposit 50,000 · lease fee 2,000",
    );
  });
});
