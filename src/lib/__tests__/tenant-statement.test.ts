import { describe, it, expect } from "vitest";
import { getLeaseYearRange } from "../date-utils";
import {
  resolveStatementPeriod,
  computeTenantStatement,
  type StatementSourceData,
  type StatementInvoiceRow,
  type StatementPaymentRow,
  type StatementPeriod,
} from "../tenant-statement";

const d = (iso: string) => new Date(iso + "T00:00:00.000Z");

// ─── getLeaseYearRange ────────────────────────────────────────────────────────

describe("getLeaseYearRange", () => {
  it("returns the anniversary year containing asOf (spec example)", () => {
    const r = getLeaseYearRange(d("2024-03-15"), d("2026-08-08"));
    expect(r).not.toBeNull();
    expect(r!.start.toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(r!.end.toISOString().slice(0, 10)).toBe("2026-08-08");
    expect(r!.yearNumber).toBe(3);
  });

  it("clamps a Feb 29 anniversary to Feb 28 in non-leap years", () => {
    const r = getLeaseYearRange(d("2024-02-29"), d("2025-06-01"));
    expect(r!.start.toISOString().slice(0, 10)).toBe("2025-02-28");
    expect(r!.yearNumber).toBe(2);
    // ...and back to Feb 29 in the next leap year
    const r2 = getLeaseYearRange(d("2024-02-29"), d("2028-06-01"));
    expect(r2!.start.toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(r2!.yearNumber).toBe(5);
  });

  it("keeps numbering continuous across renewals (leaseEnd moved, leaseStart untouched)", () => {
    // Renewed lease: leaseEnd now 2027, leaseStart still the 2023 original.
    const r = getLeaseYearRange(d("2023-01-10"), d("2026-08-08"), d("2027-01-09"));
    expect(r!.yearNumber).toBe(4);
    expect(r!.start.toISOString().slice(0, 10)).toBe("2026-01-10");
  });

  it("gives a vacated tenant their FINAL lease-year window, not an empty one", () => {
    const r = getLeaseYearRange(d("2023-05-01"), d("2026-08-08"), null, d("2025-02-10"));
    expect(r!.start.toISOString().slice(0, 10)).toBe("2024-05-01");
    expect(r!.end.toISOString().slice(0, 10)).toBe("2025-02-10");
    expect(r!.yearNumber).toBe(2);
  });

  it("caps the window end at leaseEnd for an expired lease", () => {
    const r = getLeaseYearRange(d("2023-05-01"), d("2026-08-08"), d("2024-04-30"));
    expect(r!.end.toISOString().slice(0, 10)).toBe("2024-04-30");
    expect(r!.yearNumber).toBe(1);
  });

  it("returns null for a future leaseStart", () => {
    expect(getLeaseYearRange(d("2027-01-01"), d("2026-08-08"))).toBeNull();
  });
});

// ─── resolveStatementPeriod ───────────────────────────────────────────────────

const TENANT = { leaseStart: d("2024-03-15"), leaseEnd: null, vacatedDate: null };
const ASOF = d("2026-08-08");

describe("resolveStatementPeriod", () => {
  it("lease-year default matches the spec example", () => {
    const r = resolveStatementPeriod(TENANT, { mode: "lease-year", asOf: ASOF });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.period.start.toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(r.period.end.toISOString().slice(0, 10)).toBe("2026-08-08");
    expect(r.period.leaseYearNumber).toBe(3);
    expect(r.period.label).toContain("Lease Year 3");
  });

  it("tenancy spans leaseStart → min(today, leaseEnd, vacatedDate)", () => {
    const r = resolveStatementPeriod(
      { ...TENANT, vacatedDate: d("2026-05-01") },
      { mode: "tenancy", asOf: ASOF },
    );
    if (!r.ok) throw new Error("expected ok");
    expect(r.period.start.toISOString().slice(0, 10)).toBe("2024-03-15");
    expect(r.period.end.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("calendar-year clamps to tenancy bounds", () => {
    const r = resolveStatementPeriod(TENANT, { mode: "calendar-year", year: 2024, asOf: ASOF });
    if (!r.ok) throw new Error("expected ok");
    expect(r.period.start.toISOString().slice(0, 10)).toBe("2024-03-15"); // not Jan 1
    expect(r.period.end.toISOString().slice(0, 10)).toBe("2024-12-31");
  });

  it("calendar-year outside the tenancy is NO_PERIOD, not an error range", () => {
    const r = resolveStatementPeriod(TENANT, { mode: "calendar-year", year: 2023, asOf: ASOF });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("NO_PERIOD");
  });

  it("future leaseStart returns a clear no-period state", () => {
    const r = resolveStatementPeriod(
      { leaseStart: d("2027-01-01"), leaseEnd: null, vacatedDate: null },
      { mode: "lease-year", asOf: ASOF },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("NO_PERIOD");
    expect(r.reason).toMatch(/no statement period yet/i);
  });

  it("custom rejects end < start and ranges over 5 years", () => {
    const bad = resolveStatementPeriod(TENANT, {
      mode: "custom", from: d("2026-01-01"), to: d("2025-01-01"), asOf: ASOF,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("INVALID_RANGE");

    const tooLong = resolveStatementPeriod(TENANT, {
      mode: "custom", from: d("2019-01-01"), to: d("2026-01-01"), asOf: ASOF,
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.code).toBe("INVALID_RANGE");
  });

  it("custom clamps into the tenancy and rejects zero overlap", () => {
    const clamped = resolveStatementPeriod(TENANT, {
      mode: "custom", from: d("2024-01-01"), to: d("2024-06-30"), asOf: ASOF,
    });
    if (!clamped.ok) throw new Error("expected ok");
    expect(clamped.period.start.toISOString().slice(0, 10)).toBe("2024-03-15");

    const outside = resolveStatementPeriod(TENANT, {
      mode: "custom", from: d("2023-01-01"), to: d("2023-06-30"), asOf: ASOF,
    });
    expect(outside.ok).toBe(false);
  });
});

// ─── computeTenantStatement ───────────────────────────────────────────────────

let invoiceSeq = 0;
function inv(over: Partial<StatementInvoiceRow>): StatementInvoiceRow {
  invoiceSeq++;
  return {
    id: `inv${invoiceSeq}`,
    invoiceNumber: `INV-${String(invoiceSeq).padStart(3, "0")}`,
    periodYear: 2026,
    periodMonth: 1,
    totalAmount: 50000,
    lateFeeAmount: 0,
    lateFeeAppliedAt: null,
    dueDate: d("2026-01-05"),
    status: "SENT",
    paidAmount: null,
    proofSubmittedAt: null,
    createdAt: d("2026-01-01"),
    ...over,
  };
}

let paySeq = 0;
function pay(over: Partial<StatementPaymentRow>): StatementPaymentRow {
  paySeq++;
  return {
    id: `pay${paySeq}`,
    date: d("2026-01-03"),
    type: "LONGTERM_RENT",
    grossAmount: 50000,
    paymentMethod: "MPESA",
    invoiceId: null,
    invoiceNumber: null,
    ...over,
  };
}

function src(over: Partial<StatementSourceData>): StatementSourceData {
  return {
    tenant: { id: "t1", name: "Jane Tenant", email: "jane@example.com", depositAmount: 100000 },
    unitNumber: "A1",
    property: { id: "p1", name: "Riara One", currency: "KES", organizationId: "org1" },
    invoices: [],
    payments: [],
    depositReceipts: [],
    depositSettlement: null,
    checkout: null,
    unattributedEntries: [],
    ...over,
  };
}

function period(start: string, end: string, mode: StatementPeriod["mode"] = "lease-year"): StatementPeriod {
  return { mode, start: d(start), end: d(end), label: `${start} – ${end}` };
}

describe("computeTenantStatement", () => {
  it("computes the opening balance from the ENTIRE pre-window history", () => {
    const s = computeTenantStatement(
      src({
        invoices: [
          inv({ periodYear: 2025, periodMonth: 11, totalAmount: 50000 }),
          inv({ periodYear: 2025, periodMonth: 12, totalAmount: 50000 }),
          inv({ periodYear: 2026, periodMonth: 1, totalAmount: 50000 }),
        ],
        payments: [pay({ date: d("2025-11-04"), grossAmount: 50000 })], // Nov paid, Dec not
      }),
      period("2026-01-01", "2026-03-31"),
      { asOf: d("2026-04-01") },
    );
    expect(s.openingBalance).toBe(50000); // Dec invoice unpaid
    expect(s.summary.totalInvoiced).toBe(50000); // only Jan in window
    expect(s.summary.closingBalance).toBe(100000);
    expect(s.summary.position).toBe("ARREARS");
  });

  it("tenancy mode computes the opening balance and flags pre-lease records instead of zeroing them", () => {
    const clean = computeTenantStatement(
      src({ invoices: [inv({})] }),
      period("2026-01-01", "2026-03-31", "tenancy"),
    );
    expect(clean.openingBalance).toBe(0);
    expect(clean.warnings).toHaveLength(0);

    const dirty = computeTenantStatement(
      src({ invoices: [inv({}), inv({ periodYear: 2025, periodMonth: 6 })] }),
      period("2026-01-01", "2026-03-31", "tenancy"),
    );
    // The pre-lease charge is carried in, not silently dropped.
    expect(dirty.openingBalance).toBe(50000);
    expect(dirty.summary.closingBalance).toBe(100000);
    expect(dirty.warnings.some((w) => w.includes("before the lease start"))).toBe(true);
  });

  it("a payment made before the lease start (securing the property) carries in as brought-forward credit", () => {
    const s = computeTenantStatement(
      src({
        invoices: [inv({ periodYear: 2026, periodMonth: 1, totalAmount: 50000 })],
        payments: [pay({ date: d("2025-12-20"), grossAmount: 50000 })], // paid to secure, before leaseStart
      }),
      period("2026-01-01", "2026-03-31", "tenancy"),
    );
    expect(s.openingBalance).toBe(-50000);
    expect(s.lines[0].kind).toBe("OPENING_BALANCE");
    expect(s.lines[0].description).toContain("before lease start");
    expect(s.summary.closingBalance).toBe(0);
    expect(s.summary.position).toBe("SETTLED");
    expect(s.warnings.some((w) => w.includes("secure the property"))).toBe(true);
  });

  it("excludes DEPOSIT and AIRBNB entries from the ledger (load-bearing type filter)", () => {
    const s = computeTenantStatement(
      src({
        invoices: [inv({})],
        payments: [
          pay({ date: d("2026-01-03"), grossAmount: 50000 }),
          pay({ date: d("2026-01-04"), grossAmount: 100000, type: "DEPOSIT" }),
          pay({ date: d("2026-01-05"), grossAmount: 30000, type: "AIRBNB" }),
        ],
        depositReceipts: [{ grossAmount: 100000 }],
      }),
      period("2026-01-01", "2026-03-31"),
    );
    expect(s.summary.totalPaid).toBe(50000); // deposit + airbnb excluded
    expect(s.summary.closingBalance).toBe(0);
    expect(s.deposit.received).toBe(100000); // deposit lives in its own block
    expect(s.coverage.paymentCount).toBe(1);
  });

  it("a PENDING_VERIFICATION proof is a memo line: no balance movement, no totalPaid", () => {
    const s = computeTenantStatement(
      src({
        invoices: [
          inv({
            status: "PENDING_VERIFICATION",
            proofSubmittedAt: d("2026-01-10"),
            totalAmount: 45000,
          }),
        ],
      }),
      period("2026-01-01", "2026-03-31"),
      { asOf: d("2026-01-20") },
    );
    const memo = s.lines.find((l) => l.kind === "PROOF_PENDING");
    expect(memo).toBeDefined();
    expect(memo!.balance).toBeNull();
    expect(memo!.payment).toBeNull();
    expect(memo!.daysAwaiting).toBe(10);
    expect(s.summary.totalPaid).toBe(0);
    // The invoice charge itself still stands — the balance must not drop.
    expect(s.summary.closingBalance).toBe(45000);
    expect(s.summary.awaitingConfirmation).toEqual({ count: 1, total: 45000 });
  });

  it("breaks the late fee out as its own line, never folded into rent", () => {
    const s = computeTenantStatement(
      src({
        invoices: [
          inv({
            periodYear: 2026, periodMonth: 1,
            totalAmount: 52500, lateFeeAmount: 2500, lateFeeAppliedAt: d("2026-02-10"),
          }),
        ],
      }),
      period("2026-01-01", "2026-03-31"),
    );
    const invoiceLine = s.lines.find((l) => l.kind === "INVOICE");
    const feeLine = s.lines.find((l) => l.kind === "LATE_FEE");
    expect(invoiceLine!.charge).toBe(50000); // base only
    expect(feeLine!.charge).toBe(2500);
    expect(feeLine!.date.slice(0, 10)).toBe("2026-02-10");
    expect(s.breakdown.lateFees).toBe(2500);
    expect(s.summary.totalInvoiced).toBe(52500);
  });

  it("treats a month-boundary payment as routine — ordered by date, invoice labelled by billing period", () => {
    const s = computeTenantStatement(
      src({
        invoices: [inv({ periodYear: 2026, periodMonth: 1, totalAmount: 50000 })],
        payments: [
          pay({ date: d("2026-02-03"), grossAmount: 50000, invoiceId: "inv1", invoiceNumber: "INV-X" }),
        ],
      }),
      period("2026-01-01", "2026-03-31"),
    );
    const kinds = s.lines.map((l) => l.kind);
    expect(kinds).toEqual(["OPENING_BALANCE", "INVOICE", "PAYMENT"]);
    expect(s.lines[1].description).toContain("January 2026"); // billing period, not payment month
    expect(s.lines[2].balance).toBe(0);
    expect(s.summary.position).toBe("SETTLED");
    expect(s.warnings).toHaveLength(0);
  });

  it("REFUSES an empty statement, naming unattributed property payments as the likely cause", () => {
    const s = computeTenantStatement(
      src({ unattributedEntries: [{ grossAmount: 92000 }, { grossAmount: 92000 }] }),
      period("2026-01-01", "2026-03-31"),
    );
    expect(s.coverage.isEmpty).toBe(true);
    expect(s.coverage.unattributedForProperty).toEqual({ count: 2, total: 184000 });
    expect(s.coverage.emptyReason).toMatch(/not attributed to any tenant/i);
    expect(s.coverage.emptyReason).toMatch(/backfill/i);
  });

  it("an empty statement with no unattributed residue names the never-entered cause", () => {
    const s = computeTenantStatement(src({}), period("2026-01-01", "2026-03-31"));
    expect(s.coverage.isEmpty).toBe(true);
    expect(s.coverage.emptyReason).toMatch(/not been entered/i);
  });

  it("a statement with records is not refused and reports coverage counts", () => {
    const s = computeTenantStatement(
      src({ invoices: [inv({})], payments: [pay({})] }),
      period("2026-01-01", "2026-03-31"),
    );
    expect(s.coverage.isEmpty).toBe(false);
    expect(s.coverage.emptyReason).toBeNull();
    expect(s.coverage.monthsInPeriod).toBe(3);
    expect(s.coverage.invoiceCount).toBe(1);
    expect(s.coverage.paymentCount).toBe(1);
  });

  it("marks unlinked in-window payments as unallocated, rendered neutrally", () => {
    const s = computeTenantStatement(
      src({ payments: [pay({ invoiceId: null })] }),
      period("2026-01-01", "2026-03-31"),
    );
    const line = s.lines.find((l) => l.kind === "PAYMENT");
    expect(line!.unallocated).toBe(true);
    expect(s.summary.totalPaid).toBe(50000); // fully counted — the money IS recorded
  });

  it("an invoiceless tenancy with payments is a payments-only statement: NOT_STATED, no balances", () => {
    const s = computeTenantStatement(
      src({
        payments: [
          pay({ date: d("2026-01-03"), grossAmount: 50000 }),
          pay({ date: d("2026-02-03"), grossAmount: 50000 }),
        ],
      }),
      period("2026-01-01", "2026-03-31"),
    );
    // The tenant is NOT told the landlord owes them 100k.
    expect(s.summary.position).toBe("NOT_STATED");
    expect(s.summary.totalPaid).toBe(100000);
    // Every running-balance figure is withheld, including the opening row.
    expect(s.lines.some((l) => l.kind === "OPENING_BALANCE")).toBe(false);
    expect(s.lines.every((l) => l.balance === null)).toBe(true);
    expect(s.warnings.some((w) => w.includes("payments only"))).toBe(true);
    expect(s.coverage.isEmpty).toBe(false); // records exist — not a refusal case
  });

  it("a single invoice anywhere in history keeps the balance verdict stated", () => {
    const s = computeTenantStatement(
      src({
        invoices: [inv({ periodYear: 2025, periodMonth: 12, totalAmount: 50000 })], // pre-window
        payments: [pay({ date: d("2026-01-03"), grossAmount: 50000 })],
      }),
      period("2026-01-01", "2026-03-31"),
    );
    expect(s.summary.position).not.toBe("NOT_STATED");
    expect(s.openingBalance).toBe(50000);
    expect(s.summary.closingBalance).toBe(0);
    expect(s.summary.position).toBe("SETTLED");
  });

  it("reports a credit position when payments exceed charges", () => {
    const s = computeTenantStatement(
      src({
        invoices: [inv({ totalAmount: 40000 })],
        payments: [pay({ grossAmount: 50000 })],
      }),
      period("2026-01-01", "2026-03-31"),
    );
    expect(s.summary.closingBalance).toBe(-10000);
    expect(s.summary.position).toBe("CREDIT");
  });
});
