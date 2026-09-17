import { describe, it, expect } from "vitest";
import { buildUtilityStatement, invoiceUtilityFigures, parsePeriod, periodLabel, type StatementInvoiceInput } from "../utility-statement";

const tenant = (id: string, unitNumber: string) => ({ id, name: `Tenant ${id}`, phone: "0700", email: null, unitNumber, isActive: true });

const invoice = (over: Partial<StatementInvoiceInput>): StatementInvoiceInput => ({
  id: "i1", invoiceNumber: "INV-1", tenantId: "a", periodYear: 2026, periodMonth: 7,
  dueDate: new Date("2026-07-05T00:00:00Z"), status: "SENT", paidAmount: null,
  rentAmount: 20000, waterAmount: 750, electricityAmount: 3000, totalAmount: 23750,
  ...over,
});

describe("invoiceUtilityFigures", () => {
  it("is fully unpaid when nothing has been paid", () => {
    expect(invoiceUtilityFigures(invoice({}))).toEqual({
      water: { billed: 750, paid: 0, unpaid: 750 },
      electricity: { billed: 3000, paid: 0, unpaid: 3000 },
    });
  });

  it("a rent-sized payment leaves both utilities unpaid", () => {
    const f = invoiceUtilityFigures(invoice({ paidAmount: 20000 }));
    expect(f.water.unpaid).toBe(750);
    expect(f.electricity.unpaid).toBe(3000);
  });

  it("money beyond the rent pays water first, then electricity", () => {
    const f = invoiceUtilityFigures(invoice({ paidAmount: 21000 }));
    expect(f.water).toEqual({ billed: 750, paid: 750, unpaid: 0 });
    expect(f.electricity).toEqual({ billed: 3000, paid: 250, unpaid: 2750 });
  });

  it("a PAID invoice owes nothing, even when the recorded amount is short", () => {
    const f = invoiceUtilityFigures(invoice({ status: "PAID", paidAmount: 23000 }));
    expect(f.water.unpaid).toBe(0);
    expect(f.electricity).toEqual({ billed: 3000, paid: 3000, unpaid: 0 });
  });
});

describe("buildUtilityStatement", () => {
  const asOf = new Date("2026-09-17T00:00:00Z");
  const base = {
    tenants: [tenant("a", "A2"), tenant("b", "A1"), tenant("c", "A3")],
    invoices: [
      invoice({ id: "i1", invoiceNumber: "INV-1", tenantId: "a", periodMonth: 7, paidAmount: 20000 }),
      invoice({ id: "i2", invoiceNumber: "INV-2", tenantId: "a", periodMonth: 8, dueDate: new Date("2026-08-05T00:00:00Z"), status: "PAID", paidAmount: 23750 }),
      invoice({ id: "i3", invoiceNumber: "INV-3", tenantId: "b", periodMonth: 8, status: "PAID", paidAmount: 23750 }),
      invoice({ id: "i4", invoiceNumber: "INV-4", tenantId: "b", periodMonth: 9, status: "CANCELLED" }),
    ],
    asOf,
  };

  it("sums billed / paid / unpaid per tenant and puts the debtor first", () => {
    const s = buildUtilityStatement(base);
    expect(s.rows.map((r) => r.tenantId)).toEqual(["a", "b"]);
    const a = s.rows[0];
    expect(a.water).toEqual({ billed: 1500, paid: 750, unpaid: 750 });
    expect(a.electricity).toEqual({ billed: 6000, paid: 3000, unpaid: 3000 });
    expect(a.totalUnpaid).toBe(3750);
    expect(a.unpaidInvoices).toBe(1);
    expect(a.oldestUnpaidPeriod).toBe("2026-07");
    expect(a.invoices.map((i) => i.overdue)).toEqual([true, false]);
  });

  it("ignores cancelled invoices and tenants with no utility history", () => {
    const s = buildUtilityStatement(base);
    expect(s.rows.find((r) => r.tenantId === "b")?.invoices).toHaveLength(1);
    expect(s.rows.find((r) => r.tenantId === "c")).toBeUndefined();
  });

  it("totals the property", () => {
    const s = buildUtilityStatement(base);
    expect(s.totals.water).toEqual({ billed: 2250, paid: 1500, unpaid: 750 });
    expect(s.totals.electricity).toEqual({ billed: 9000, paid: 6000, unpaid: 3000 });
    expect(s.totals.totalUnpaid).toBe(3750);
    expect(s.totals.tenantsOwing).toBe(1);
  });

  it("unpaidOnly keeps only tenants who owe", () => {
    expect(buildUtilityStatement({ ...base, unpaidOnly: true }).rows.map((r) => r.tenantId)).toEqual(["a"]);
  });

  it("lists a tenant whose readings are approved but not invoiced yet", () => {
    const s = buildUtilityStatement({ ...base, notYetInvoiced: { c: 600 }, lastPayment: { a: new Date("2026-08-10T00:00:00Z") } });
    const c = s.rows.find((r) => r.tenantId === "c")!;
    expect(c.notYetInvoiced).toBe(600);
    expect(c.totalUnpaid).toBe(0);
    expect(s.totals.notYetInvoiced).toBe(600);
    expect(s.rows.find((r) => r.tenantId === "a")?.lastPaymentDate).toBe("2026-08-10T00:00:00.000Z");
  });
});

describe("period helpers", () => {
  it("parses and labels YYYY-MM", () => {
    expect(parsePeriod("2026-06")).toEqual({ year: 2026, month: 6 });
    expect(parsePeriod("2026-13")).toBeNull();
    expect(parsePeriod("June")).toBeNull();
    expect(periodLabel("2026-06")).toBe("Jun 2026");
    expect(periodLabel(null)).toBe("—");
  });
});
