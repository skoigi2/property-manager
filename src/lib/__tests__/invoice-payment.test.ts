import { describe, it, expect } from "vitest";
import {
  allocateInvoicePayment,
  describeAllocation,
  invoiceHasMoveInLines,
  invoiceHasNonRentLines,
  invoiceLinesTotal,
  invoiceOutstandingByBucket,
  invoicePaymentBuckets,
  invoiceRentSide,
  invoiceUtilitiesTotal,
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

// ─── Metered utilities ───────────────────────────────────────────────────────

// July rent invoice carrying June's water (5 units @ 150) and power.
const rentAndUtilities = { rentAmount: 22000, serviceCharge: 3000, waterAmount: 750, electricityAmount: 1200 };
const utilitiesOnly = { rentAmount: 0, waterAmount: 750, electricityAmount: 1200 };

describe("invoices with water / electricity lines", () => {
  it("totals the utility lines but keeps them out of the rent side", () => {
    expect(invoiceLinesTotal(rentAndUtilities)).toBe(26950);
    expect(invoiceRentSide(rentAndUtilities)).toBe(25000);
    expect(invoiceUtilitiesTotal(rentAndUtilities)).toBe(1950);
  });

  it("needs a split payment, though it has no move-in lines", () => {
    expect(invoiceHasMoveInLines(rentAndUtilities)).toBe(false);
    expect(invoiceHasNonRentLines(rentAndUtilities)).toBe(true);
    expect(invoiceHasNonRentLines(rentOnly)).toBe(false);
    expect(invoiceHasNonRentLines(moveIn)).toBe(true);
  });

  it("orders buckets rent → water → electricity → deposit → lease fee", () => {
    expect(invoicePaymentBuckets({ ...moveIn, waterAmount: 750, electricityAmount: 1200 })).toEqual([
      { type: "LONGTERM_RENT", amount: 25000 },
      { type: "UTILITY_RECOVERY", utility: "WATER", amount: 750 },
      { type: "UTILITY_RECOVERY", utility: "ELECTRICITY", amount: 1200 },
      { type: "DEPOSIT", amount: 50000 },
      { type: "LEASE_FEE", amount: 2000 },
    ]);
  });

  it("a full payment books rent as rent and each utility as tagged utility recovery", () => {
    expect(allocateInvoicePayment(rentAndUtilities, 26950)).toEqual([
      { type: "LONGTERM_RENT", amount: 25000 },
      { type: "UTILITY_RECOVERY", utility: "WATER", amount: 750 },
      { type: "UTILITY_RECOVERY", utility: "ELECTRICITY", amount: 1200 },
    ]);
  });

  it("a rent-sized payment leaves the utilities unpaid, and the next one settles them", () => {
    expect(allocateInvoicePayment(rentAndUtilities, 25000)).toEqual([{ type: "LONGTERM_RENT", amount: 25000 }]);
    expect(allocateInvoicePayment(rentAndUtilities, 1950, 25000)).toEqual([
      { type: "UTILITY_RECOVERY", utility: "WATER", amount: 750 },
      { type: "UTILITY_RECOVERY", utility: "ELECTRICITY", amount: 1200 },
    ]);
  });

  it("an overpayment is rent, never inflated utility income", () => {
    expect(allocateInvoicePayment(rentAndUtilities, 27950)).toEqual([
      { type: "LONGTERM_RENT", amount: 26000 },
      { type: "UTILITY_RECOVERY", utility: "WATER", amount: 750 },
      { type: "UTILITY_RECOVERY", utility: "ELECTRICITY", amount: 1200 },
    ]);
  });

  it("an overpayment arriving after rent was settled opens a rent credit part", () => {
    expect(allocateInvoicePayment(rentAndUtilities, 2950, 25000)).toEqual([
      { type: "UTILITY_RECOVERY", utility: "WATER", amount: 750 },
      { type: "UTILITY_RECOVERY", utility: "ELECTRICITY", amount: 1200 },
      { type: "LONGTERM_RENT", amount: 1000 },
    ]);
  });

  it("a utilities-only invoice books its excess as a rent credit", () => {
    expect(allocateInvoicePayment(utilitiesOnly, 2000)).toEqual([
      { type: "UTILITY_RECOVERY", utility: "WATER", amount: 750 },
      { type: "UTILITY_RECOVERY", utility: "ELECTRICITY", amount: 1200 },
      { type: "LONGTERM_RENT", amount: 50 },
    ]);
  });

  it("money arriving on an already settled invoice is rent credit", () => {
    expect(allocateInvoicePayment(utilitiesOnly, 500, 1950)).toEqual([{ type: "LONGTERM_RENT", amount: 500 }]);
    expect(allocateInvoicePayment(moveIn, 500, 77000)).toEqual([{ type: "LEASE_FEE", amount: 500 }]);
  });

  it("describes utilities by name", () => {
    const fmt = (n: number) => n.toLocaleString("en-US");
    expect(describeAllocation(allocateInvoicePayment(rentAndUtilities, 26950), fmt)).toBe(
      "rent 25,000 · water 750 · electricity 1,200",
    );
  });
});

describe("invoiceOutstandingByBucket", () => {
  it("is the whole invoice when nothing is paid", () => {
    expect(invoiceOutstandingByBucket(rentAndUtilities, 0)).toEqual({
      rent: 25000, water: 750, electricity: 1200, deposit: 0, leaseFee: 0, total: 26950,
    });
  });

  it("shows unpaid water and power once the rent is covered", () => {
    expect(invoiceOutstandingByBucket(rentAndUtilities, 25000)).toEqual({
      rent: 0, water: 750, electricity: 1200, deposit: 0, leaseFee: 0, total: 1950,
    });
    expect(invoiceOutstandingByBucket(rentAndUtilities, 25500)).toEqual({
      rent: 0, water: 250, electricity: 1200, deposit: 0, leaseFee: 0, total: 1450,
    });
  });

  it("is zero when paid in full or overpaid, and treats a null paidAmount as unpaid", () => {
    expect(invoiceOutstandingByBucket(rentAndUtilities, 30000).total).toBe(0);
    expect(invoiceOutstandingByBucket(rentOnly, null).total).toBe(25000);
  });
});
