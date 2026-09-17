import { describe, it, expect } from "vitest";
import {
  groupReceipts,
  receiptDescription,
  receiptGroupKey,
  receiptLines,
  receiptNumberFor,
  receiptPrimary,
  receiptStamp,
} from "../payment-receipt";

const d = (s: string) => new Date(s);

const rent = { id: "cmt000000000000000rent01", date: d("2026-10-01"), type: "LONGTERM_RENT", grossAmount: 25000, invoiceId: "inv1", createdAt: d("2026-10-01T10:00:00Z") };
const dep = { id: "cmt000000000000000depo01", date: d("2026-10-01"), type: "DEPOSIT", grossAmount: 50000, invoiceId: "inv1", createdAt: d("2026-10-01T10:00:01Z") };
const fee = { id: "cmt000000000000000fee001", date: d("2026-10-01"), type: "LEASE_FEE", grossAmount: 2000, invoiceId: "inv1", createdAt: d("2026-10-01T10:00:02Z") };
const later = { id: "cmt000000000000000rent02", date: d("2026-11-01"), type: "LONGTERM_RENT", grossAmount: 25000, invoiceId: "inv2", createdAt: d("2026-11-01T10:00:00Z") };
const loose = { id: "cmt000000000000000depo02", date: d("2026-09-05"), type: "DEPOSIT", grossAmount: 50000, invoiceId: null, createdAt: d("2026-09-05T10:00:00Z") };

describe("receipt grouping", () => {
  it("groups entries paid against the same invoice on the same day", () => {
    expect(receiptGroupKey(rent)).toBe(receiptGroupKey(dep));
    expect(receiptGroupKey(rent)).not.toBe(receiptGroupKey(later));
    expect(receiptGroupKey(loose)).toBe(loose.id);
  });

  it("picks the earliest-created entry as primary", () => {
    expect(receiptPrimary([fee, dep, rent]).id).toBe(rent.id);
  });

  it("collapses a tenant's entries into receipts, newest first", () => {
    const groups = groupReceipts([fee, loose, rent, later, dep]);
    expect(groups.map((g) => g.amount)).toEqual([25000, 77000, 50000]);
    expect(groups[1].entries).toHaveLength(3);
    expect(groups[1].primary.id).toBe(rent.id);
  });
});

describe("receipt number", () => {
  it("is stable and derived from the payment date + primary id", () => {
    expect(receiptNumberFor(rent)).toBe("RCPT-20261001-RENT01");
    expect(receiptNumberFor(rent)).toBe(receiptNumberFor({ ...rent }));
    expect(receiptNumberFor(loose)).toBe("RCPT-20260905-DEPO02");
  });
});

describe("receipt lines and description", () => {
  it("labels each line by type, rent by the invoice period", () => {
    expect(receiptLines([rent, dep, fee], { periodYear: 2026, periodMonth: 10 })).toEqual([
      { label: "Rent — October 2026", amount: 25000 },
      { label: "Refundable security deposit", amount: 50000 },
      { label: "Lease agreement fee", amount: 2000 },
    ]);
  });

  it("falls back to the payment month for rent without an invoice", () => {
    expect(receiptLines([{ ...rent, invoiceId: null }])[0].label).toBe("Rent — October 2026");
  });

  it("summarises multi-line receipts", () => {
    const lines = receiptLines([rent, dep, fee], { periodYear: 2026, periodMonth: 10 });
    expect(receiptDescription(lines)).toBe("Rent + deposit + lease agreement fee");
    expect(receiptDescription(receiptLines([loose]))).toBe("Refundable security deposit");
  });
});

describe("receipt stamp", () => {
  it("is PAID IN FULL for stand-alone payments and settled invoices (1% tolerance)", () => {
    expect(receiptStamp({}).headline).toContain("PAID IN FULL");
    expect(receiptStamp({ invoice: { totalAmount: 77000, paidToDate: 77000 } }).headline).toContain("PAID IN FULL");
    expect(receiptStamp({ invoice: { totalAmount: 77000, paidToDate: 76500 } }).headline).toContain("PAID IN FULL");
  });

  it("is PART PAYMENT while a balance remains", () => {
    expect(receiptStamp({ invoice: { totalAmount: 77000, paidToDate: 40000 } }).headline).toContain("PART PAYMENT");
  });
});

describe("utility recovery lines", () => {
  it("names the utility that was paid", () => {
    const lines = receiptLines(
      [
        { id: "a", date: "2026-07-04", type: "LONGTERM_RENT", grossAmount: 20000, invoiceId: "i" },
        { id: "b", date: "2026-07-04", type: "UTILITY_RECOVERY", utilityType: "WATER", grossAmount: 750, invoiceId: "i" },
        { id: "c", date: "2026-07-04", type: "UTILITY_RECOVERY", utilityType: "ELECTRICITY", grossAmount: 3000, invoiceId: "i" },
      ],
      { periodYear: 2026, periodMonth: 7 },
    );
    expect(lines.map((l) => l.label)).toEqual(["Rent — July 2026", "Water", "Electricity"]);
  });

  it("falls back to 'Utilities' when the entry does not say which", () => {
    expect(receiptLines([{ id: "a", date: "2026-07-04", type: "UTILITY_RECOVERY", grossAmount: 500 }])[0].label).toBe("Utilities");
  });
});
