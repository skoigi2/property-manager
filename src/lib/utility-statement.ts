// Utility statement — pure builder (no prisma), unit-tested.
//
// Answers "who has paid their water and electricity, and who hasn't?" for a
// whole property (the manager's chase list) or for one tenant (their utility
// statement). Paid / unpaid is derived from each invoice's payment walk:
// a payment fills rent first, then water, then electricity
// (invoiceOutstandingByBucket), so an invoice whose rent is settled but whose
// total is not is exactly where unpaid utilities show up.

import { invoiceOutstandingByBucket, type InvoiceLinesLike } from "@/lib/invoice-payment";
import { periodIndex } from "@/lib/utility-billing";

export interface StatementInvoiceInput extends InvoiceLinesLike {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  dueDate: Date;
  status: string;
  paidAmount: number | null;
  totalAmount: number;
}

export interface StatementTenantInput {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  unitNumber: string;
  isActive: boolean;
}

export interface UtilityFigures {
  billed: number;
  paid: number;
  unpaid: number;
}

export interface StatementInvoiceLine {
  invoiceId: string;
  invoiceNumber: string;
  periodYear: number;
  periodMonth: number;
  dueDate: string;
  status: string;
  overdue: boolean;
  water: UtilityFigures;
  electricity: UtilityFigures;
}

export interface StatementTenantRow {
  tenantId: string;
  tenantName: string;
  phone: string | null;
  email: string | null;
  unitNumber: string;
  isActive: boolean;
  water: UtilityFigures;
  electricity: UtilityFigures;
  totalUnpaid: number;
  /** Invoices with any utility still unpaid. */
  unpaidInvoices: number;
  /** Billing period of the oldest unpaid utility invoice, e.g. "2026-06". */
  oldestUnpaidPeriod: string | null;
  /** Approved readings not yet on an invoice — owed, but not billed. */
  notYetInvoiced: number;
  lastPaymentDate: string | null;
  invoices: StatementInvoiceLine[];
}

export interface UtilityStatement {
  rows: StatementTenantRow[];
  totals: { water: UtilityFigures; electricity: UtilityFigures; totalUnpaid: number; notYetInvoiced: number; tenantsOwing: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const zero = (): UtilityFigures => ({ billed: 0, paid: 0, unpaid: 0 });

function add(a: UtilityFigures, b: UtilityFigures) {
  a.billed = round2(a.billed + b.billed);
  a.paid = round2(a.paid + b.paid);
  a.unpaid = round2(a.unpaid + b.unpaid);
}

/** Billed / paid / unpaid per utility for one invoice. */
export function invoiceUtilityFigures(inv: StatementInvoiceInput): { water: UtilityFigures; electricity: UtilityFigures } {
  const waterBilled = round2(inv.waterAmount ?? 0);
  const elecBilled = round2(inv.electricityAmount ?? 0);
  // A PAID invoice is settled even when the recorded amount is short (the
  // manager accepted it); a DRAFT has not been presented, so nothing is "unpaid" yet
  // beyond what is billed — it still counts as owed.
  const out = inv.status === "PAID" ? { water: 0, electricity: 0 } : invoiceOutstandingByBucket(inv, inv.paidAmount);
  return {
    water: { billed: waterBilled, unpaid: round2(out.water), paid: round2(waterBilled - out.water) },
    electricity: { billed: elecBilled, unpaid: round2(out.electricity), paid: round2(elecBilled - out.electricity) },
  };
}

export function buildUtilityStatement(input: {
  tenants: StatementTenantInput[];
  invoices: StatementInvoiceInput[];
  /** tenantId → approved, not-yet-invoiced amount. */
  notYetInvoiced?: Record<string, number>;
  /** tenantId → date of the latest UTILITY_RECOVERY receipt. */
  lastPayment?: Record<string, Date>;
  asOf?: Date;
  unpaidOnly?: boolean;
}): UtilityStatement {
  const asOf = input.asOf ?? new Date();
  const rows: StatementTenantRow[] = [];

  for (const t of input.tenants) {
    const invoices = input.invoices
      .filter((i) => i.tenantId === t.id && i.status !== "CANCELLED" && ((i.waterAmount ?? 0) > 0 || (i.electricityAmount ?? 0) > 0))
      .sort((a, b) => periodIndex(a.periodYear, a.periodMonth) - periodIndex(b.periodYear, b.periodMonth));

    const water = zero();
    const electricity = zero();
    const lines: StatementInvoiceLine[] = [];
    let oldest: StatementInvoiceInput | null = null;
    let unpaidInvoices = 0;

    for (const inv of invoices) {
      const f = invoiceUtilityFigures(inv);
      add(water, f.water);
      add(electricity, f.electricity);
      const owing = f.water.unpaid + f.electricity.unpaid > 0.005;
      if (owing) {
        unpaidInvoices++;
        if (!oldest) oldest = inv;
      }
      lines.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        periodYear: inv.periodYear,
        periodMonth: inv.periodMonth,
        dueDate: inv.dueDate.toISOString(),
        status: inv.status,
        overdue: owing && inv.dueDate.getTime() < asOf.getTime(),
        water: f.water,
        electricity: f.electricity,
      });
    }

    const notYetInvoiced = round2(input.notYetInvoiced?.[t.id] ?? 0);
    const totalUnpaid = round2(water.unpaid + electricity.unpaid);
    if (invoices.length === 0 && notYetInvoiced === 0) continue;
    if (input.unpaidOnly && totalUnpaid <= 0.005) continue;

    rows.push({
      tenantId: t.id,
      tenantName: t.name,
      phone: t.phone,
      email: t.email,
      unitNumber: t.unitNumber,
      isActive: t.isActive,
      water,
      electricity,
      totalUnpaid,
      unpaidInvoices,
      oldestUnpaidPeriod: oldest ? `${oldest.periodYear}-${String(oldest.periodMonth).padStart(2, "0")}` : null,
      notYetInvoiced,
      lastPaymentDate: input.lastPayment?.[t.id]?.toISOString() ?? null,
      invoices: lines,
    });
  }

  // Biggest debt first; settled tenants by unit number.
  rows.sort(
    (a, b) => b.totalUnpaid - a.totalUnpaid || a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
  );

  const totals = { water: zero(), electricity: zero(), totalUnpaid: 0, notYetInvoiced: 0, tenantsOwing: 0 };
  for (const r of rows) {
    add(totals.water, r.water);
    add(totals.electricity, r.electricity);
    totals.totalUnpaid = round2(totals.totalUnpaid + r.totalUnpaid);
    totals.notYetInvoiced = round2(totals.notYetInvoiced + r.notYetInvoiced);
    if (r.totalUnpaid > 0.005) totals.tenantsOwing++;
  }
  return { rows, totals };
}

/** "2026-06" → "Jun 2026". */
export function periodLabel(period: string | null): string {
  if (!period) return "—";
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Parses "YYYY-MM"; null when malformed. */
export function parsePeriod(s: string | null | undefined): { year: number; month: number } | null {
  if (!s || !/^\d{4}-\d{1,2}$/.test(s)) return null;
  const [year, month] = s.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return { year, month };
}
