import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildUtilityStatement, invoiceUtilityFigures, type StatementInvoiceInput, type UtilityStatement } from "@/lib/utility-statement";
import { DEFAULT_UNIT_LABEL, readingLineLabel, type UtilityType } from "@/lib/utility-billing";

/**
 * Prisma side of the utility statement (pure builder: utility-statement.ts).
 * One loader serves the property chase list, its Excel / PDF exports, the
 * reminder emails, the tenant's own utility statement and the portal.
 */

export interface StatementRange {
  from?: { year: number; month: number } | null;
  to?: { year: number; month: number } | null;
}

function periodWhere(range: StatementRange): Prisma.InvoiceWhereInput {
  const and: Prisma.InvoiceWhereInput[] = [];
  if (range.from) {
    and.push({ OR: [{ periodYear: { gt: range.from.year } }, { periodYear: range.from.year, periodMonth: { gte: range.from.month } }] });
  }
  if (range.to) {
    and.push({ OR: [{ periodYear: { lt: range.to.year } }, { periodYear: range.to.year, periodMonth: { lte: range.to.month } }] });
  }
  return and.length ? { AND: and } : {};
}

const INVOICE_SELECT = {
  id: true, invoiceNumber: true, tenantId: true, periodYear: true, periodMonth: true,
  dueDate: true, status: true, paidAmount: true, totalAmount: true,
  rentAmount: true, serviceCharge: true, otherCharges: true, lateFeeAmount: true,
  waterAmount: true, electricityAmount: true, depositAmount: true, leaseFee: true,
} as const;

export interface PropertyStatementResult {
  property: { id: string; name: string; currency: string; organizationId: string | null };
  statement: UtilityStatement;
}

/** Whole-property statement; `tenantId` narrows it to one tenant. */
export async function loadUtilityStatement(opts: {
  propertyId: string;
  range?: StatementRange;
  unpaidOnly?: boolean;
  tenantId?: string;
}): Promise<PropertyStatementResult | null> {
  const property = await prisma.property.findUnique({
    where: { id: opts.propertyId },
    select: { id: true, name: true, currency: true, organizationId: true },
  });
  if (!property) return null;

  const tenantWhere: Prisma.TenantWhereInput = { unit: { propertyId: property.id }, ...(opts.tenantId ? { id: opts.tenantId } : {}) };
  const [tenants, invoices, pending, payments] = await Promise.all([
    prisma.tenant.findMany({
      where: tenantWhere,
      select: { id: true, name: true, phone: true, email: true, isActive: true, unit: { select: { unitNumber: true } } },
    }),
    prisma.invoice.findMany({
      where: {
        tenant: tenantWhere,
        status: { not: "CANCELLED" },
        OR: [{ waterAmount: { gt: 0 } }, { electricityAmount: { gt: 0 } }],
        ...periodWhere(opts.range ?? {}),
      },
      select: INVOICE_SELECT,
    }),
    // Approved, priced, not on a live invoice: owed but not billed yet.
    prisma.meterReading.findMany({
      where: {
        status: "APPROVED",
        amount: { gt: 0 },
        tenant: tenantWhere,
        meter: { role: "UNIT" },
        OR: [{ invoiceId: null }, { invoice: { status: "CANCELLED" } }],
      },
      select: { tenantId: true, amount: true },
    }),
    prisma.incomeEntry.groupBy({
      by: ["tenantId"],
      where: { type: "UTILITY_RECOVERY", tenant: tenantWhere },
      _max: { date: true },
    }),
  ]);

  const notYetInvoiced: Record<string, number> = {};
  for (const r of pending) {
    if (r.tenantId) notYetInvoiced[r.tenantId] = (notYetInvoiced[r.tenantId] ?? 0) + (r.amount ?? 0);
  }
  const lastPayment: Record<string, Date> = {};
  for (const p of payments) {
    if (p.tenantId && p._max.date) lastPayment[p.tenantId] = p._max.date;
  }

  const statement = buildUtilityStatement({
    tenants: tenants.map((t) => ({ id: t.id, name: t.name, phone: t.phone, email: t.email, isActive: t.isActive, unitNumber: t.unit.unitNumber })),
    invoices: invoices as StatementInvoiceInput[],
    notYetInvoiced,
    lastPayment,
    unpaidOnly: opts.unpaidOnly,
  });
  return { property, statement };
}

// ─── Reading history (tenant utility statement, tenant tab, portal) ─────────

export interface TenantReadingRow {
  id: string;
  utility: UtilityType;
  meterLabel: string;
  periodYear: number;
  periodMonth: number;
  readingDate: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  unitLabel: string;
  ratePerUnit: number | null;
  amount: number;
  /** "Jun 26 Water: 3 units (Prev: 176.00, Curr: 179.00) @ 175.00" */
  description: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** PAID / PART_PAID / UNPAID once invoiced; NOT_INVOICED before. */
  paymentStatus: "PAID" | "PART_PAID" | "UNPAID" | "NOT_INVOICED";
  photoPaths: string[];
}

/**
 * The tenant's APPROVED unit readings, newest first — a reading the manager
 * has not checked is never shown to a tenant. Payment status comes from the
 * invoice's per-utility figures (shared across that invoice's readings of
 * the same utility).
 */
export async function loadTenantReadings(tenantId: string, propertyId: string, take = 60): Promise<TenantReadingRow[]> {
  const [readings, settings] = await Promise.all([
    prisma.meterReading.findMany({
      where: { tenantId, status: "APPROVED", meter: { role: "UNIT" } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      take,
      select: {
        id: true, periodYear: true, periodMonth: true, readingDate: true, previousReading: true,
        currentReading: true, consumption: true, ratePerUnit: true, amount: true, photoPaths: true,
        meter: { select: { label: true, utility: true } },
        invoice: { select: INVOICE_SELECT },
      },
    }),
    prisma.utilitySetting.findMany({ where: { propertyId }, select: { utility: true, unitLabel: true } }),
  ]);
  const unitLabel = (u: UtilityType) => settings.find((s) => s.utility === u)?.unitLabel ?? DEFAULT_UNIT_LABEL[u];

  return readings.map((r) => {
    const live = r.invoice && r.invoice.status !== "CANCELLED" ? (r.invoice as StatementInvoiceInput) : null;
    let paymentStatus: TenantReadingRow["paymentStatus"] = "NOT_INVOICED";
    if (live) {
      const f = invoiceUtilityFigures(live)[r.meter.utility === "WATER" ? "water" : "electricity"];
      paymentStatus = f.unpaid <= 0.005 ? "PAID" : f.paid > 0.005 ? "PART_PAID" : "UNPAID";
    }
    return {
      id: r.id,
      utility: r.meter.utility,
      meterLabel: r.meter.label,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      readingDate: r.readingDate.toISOString(),
      previousReading: r.previousReading,
      currentReading: r.currentReading,
      consumption: r.consumption,
      unitLabel: unitLabel(r.meter.utility),
      ratePerUnit: r.ratePerUnit,
      amount: r.amount ?? 0,
      description: readingLineLabel({
        periodYear: r.periodYear, periodMonth: r.periodMonth, label: r.meter.label, unitLabel: unitLabel(r.meter.utility),
        previousReading: r.previousReading, currentReading: r.currentReading, consumption: r.consumption, ratePerUnit: r.ratePerUnit,
      }),
      invoiceId: live?.id ?? null,
      invoiceNumber: live?.invoiceNumber ?? null,
      paymentStatus,
      photoPaths: r.photoPaths,
    };
  });
}

// ─── One tenant's view (tenant detail tab, portal, tenant-mode PDF) ─────────

export interface TenantUtilityView {
  tenant: { id: string; name: string; unitNumber: string };
  property: { id: string; name: string; currency: string; organizationId: string | null };
  /** Null when the tenant has never been billed for a utility. */
  summary: UtilityStatement["rows"][number] | null;
  statement: UtilityStatement;
  readings: TenantReadingRow[];
}

export async function loadTenantUtilityView(tenantId: string): Promise<TenantUtilityView | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, unit: { select: { unitNumber: true, propertyId: true } } },
  });
  if (!tenant) return null;
  const [result, readings] = await Promise.all([
    loadUtilityStatement({ propertyId: tenant.unit.propertyId, tenantId }),
    loadTenantReadings(tenantId, tenant.unit.propertyId),
  ]);
  if (!result) return null;
  return {
    tenant: { id: tenant.id, name: tenant.name, unitNumber: tenant.unit.unitNumber },
    property: result.property,
    summary: result.statement.rows[0] ?? null,
    statement: result.statement,
    readings,
  };
}
