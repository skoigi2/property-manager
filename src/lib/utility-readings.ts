import "server-only";
import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminSession, MANAGER_ROLES, isRoleAllowed } from "@/lib/auth-utils";
import { allocateInvoiceNumber } from "@/lib/invoice-numbering";
import { invoiceLinesTotal } from "@/lib/invoice-payment";
import { getSignedUrl } from "@/lib/supabase-storage";
import {
  blocksApproval,
  calcConsumption,
  calcReadingCharge,
  canChangeInvoiceUtilities,
  DEFAULT_UNIT_LABEL,
  periodIndex,
  readingAnomalies,
  resolveReadingRates,
  resolveTariffForPeriod,
  sumReadingsByUtility,
  type ReadingAnomaly,
  type UtilityType,
} from "@/lib/utility-billing";

/**
 * Server side of utility metering: submitting, approving, voiding and billing
 * meter readings. Pure rules live in utility-billing.ts.
 *
 * Invariants kept here:
 * - previousReading is always derived on the server (latest non-VOID reading
 *   of an earlier period, else the meter's opening reading) unless a manager
 *   overrides it with a reason.
 * - only a meter's latest reading may be edited or voided — a later row has
 *   already snapshotted this one as its "previous".
 * - Invoice.waterAmount / electricityAmount always equal the attached
 *   non-VOID readings, and never change once money is booked on the invoice.
 * - "billed" is derived: invoiceId set AND that invoice not CANCELLED.
 */

export type ServiceError = { ok: false; status: number; error: string; code?: string };
const fail = (status: number, error: string, code?: string): ServiceError => ({ ok: false, status, error, code });

/** Rates and amounts are manager-tier only; the caretaker sees units. */
export function canSeeUtilityMoney(session: Session): boolean {
  return isRoleAllowed(session.user.orgRole, MANAGER_ROLES, isSuperAdminSession(session));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function beforePeriodWhere(year: number, month: number): Prisma.MeterReadingWhereInput {
  return { OR: [{ periodYear: { lt: year } }, { periodYear: year, periodMonth: { lt: month } }] };
}

function afterPeriodWhere(year: number, month: number): Prisma.MeterReadingWhereInput {
  return { OR: [{ periodYear: { gt: year } }, { periodYear: year, periodMonth: { gt: month } }] };
}

/** A reading that is not (or no longer) on a live invoice. */
const NOT_BILLED: Prisma.MeterReadingWhereInput = {
  OR: [{ invoiceId: null }, { invoice: { status: "CANCELLED" } }],
};

export function isReadingBilled(r: { invoiceId: string | null; invoice?: { status: string } | null }): boolean {
  return !!r.invoiceId && r.invoice?.status !== "CANCELLED";
}

// ─── Reading sheet (the month's list of meters) ─────────────────────────────

export interface ReadingSheetRow {
  meterId: string;
  utility: UtilityType;
  role: "UNIT" | "COMMON" | "BULK";
  label: string;
  meterNumber: string | null;
  unitId: string | null;
  unitNumber: string | null;
  occupantName: string | null;
  unitLabel: string;
  previousReading: number;
  /** True when a later period already has a reading — this row is locked. */
  locked: boolean;
  reading: {
    id: string;
    status: "SUBMITTED" | "APPROVED" | "VOID";
    readingDate: string;
    previousReading: number;
    currentReading: number;
    consumption: number;
    notes: string | null;
    previousOverrideReason: string | null;
    readByName: string | null;
    readByUserId: string | null;
    approvedByName: string | null;
    photoUrls: string[];
    billed: boolean;
    // Manager tier only — absent from the caretaker payload altogether.
    ratePerUnit?: number | null;
    amount?: number | null;
    invoiceId?: string | null;
    invoiceNumber?: string | null;
    tenantName?: string | null;
    anomalies?: ReadingAnomaly[];
    /** Estimated charge while SUBMITTED, from the tariff in force. */
    estimatedAmount?: number | null;
    estimatedRate?: number | null;
  } | null;
}

async function signPhotos(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    try {
      out.push(await getSignedUrl(p, 3600));
    } catch {
      // A missing object or unconfigured storage must not fail the sheet.
    }
  }
  return out;
}

export async function buildReadingSheet(opts: {
  propertyId: string;
  year: number;
  month: number;
  utility?: UtilityType;
  includeMoney: boolean;
}): Promise<{ rows: ReadingSheetRow[]; settings: Record<string, { unitLabel: string; requirePhoto: boolean; holdInvoicesForReadings: boolean }>; hasTariff: Record<string, boolean> }> {
  const { propertyId, year, month, utility, includeMoney } = opts;
  const [meters, settings, tariffs] = await Promise.all([
    prisma.utilityMeter.findMany({
      where: { propertyId, isActive: true, ...(utility ? { utility } : {}) },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            tenants: { where: { isActive: true }, select: { id: true, name: true }, take: 1 },
          },
        },
      },
    }),
    prisma.utilitySetting.findMany({ where: { propertyId } }),
    prisma.utilityTariff.findMany({ where: { propertyId } }),
  ]);

  const readings = meters.length
    ? await prisma.meterReading.findMany({
        where: { meterId: { in: meters.map((m) => m.id) }, status: { not: "VOID" } },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        include: {
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
          tenant: { select: { name: true } },
        },
      })
    : [];

  const settingMap: Record<string, { unitLabel: string; requirePhoto: boolean; holdInvoicesForReadings: boolean }> = {};
  for (const u of ["WATER", "ELECTRICITY"] as UtilityType[]) {
    const s = settings.find((x) => x.utility === u);
    settingMap[u] = {
      unitLabel: s?.unitLabel ?? DEFAULT_UNIT_LABEL[u],
      requirePhoto: s?.requirePhoto ?? false,
      holdInvoicesForReadings: s?.holdInvoicesForReadings ?? true,
    };
  }

  const idx = periodIndex(year, month);
  const rows: ReadingSheetRow[] = [];
  for (const m of meters) {
    const mine = readings.filter((r) => r.meterId === m.id);
    const current = mine.find((r) => r.periodYear === year && r.periodMonth === month) ?? null;
    const earlier = mine.filter((r) => periodIndex(r.periodYear, r.periodMonth) < idx);
    const locked = mine.some((r) => periodIndex(r.periodYear, r.periodMonth) > idx);
    const previousReading = current?.previousReading ?? earlier[0]?.currentReading ?? m.openingReading;
    const occupant = m.unit?.tenants[0] ?? null;

    let reading: ReadingSheetRow["reading"] = null;
    if (current) {
      reading = {
        id: current.id,
        status: current.status,
        readingDate: current.readingDate.toISOString(),
        previousReading: current.previousReading,
        currentReading: current.currentReading,
        consumption: current.consumption,
        notes: current.notes,
        previousOverrideReason: current.previousOverrideReason,
        readByName: current.readByName,
        readByUserId: current.readByUserId,
        approvedByName: current.approvedByName,
        photoUrls: await signPhotos(current.photoPaths),
        billed: isReadingBilled(current),
      };
      if (includeMoney) {
        const tariff = resolveTariffForPeriod(
          tariffs.filter((t) => t.utility === m.utility),
          year,
          month,
        );
        const rates = m.role === "UNIT" ? resolveReadingRates(tariff, m.ratePerUnitOverride) : null;
        Object.assign(reading, {
          ratePerUnit: current.ratePerUnit,
          amount: current.amount,
          invoiceId: isReadingBilled(current) ? current.invoiceId : null,
          invoiceNumber: isReadingBilled(current) ? current.invoice?.invoiceNumber ?? null : null,
          tenantName: current.tenant?.name ?? null,
          anomalies: readingAnomalies({
            consumption: current.consumption,
            occupied: m.role === "UNIT" && !!current.tenantId,
            history: earlier.map((r) => r.consumption),
          }),
          estimatedRate: rates?.ratePerUnit ?? null,
          estimatedAmount: rates ? calcReadingCharge(current.consumption, rates.ratePerUnit) : null,
        });
      }
    }

    rows.push({
      meterId: m.id,
      utility: m.utility,
      role: m.role,
      label: m.label,
      meterNumber: m.meterNumber,
      unitId: m.unitId,
      unitNumber: m.unit?.unitNumber ?? null,
      occupantName: occupant?.name ?? null,
      unitLabel: settingMap[m.utility].unitLabel,
      previousReading,
      locked,
      reading,
    });
  }

  const roleOrder = { BULK: 0, COMMON: 1, UNIT: 2 } as const;
  rows.sort(
    (a, b) =>
      a.utility.localeCompare(b.utility) ||
      roleOrder[a.role] - roleOrder[b.role] ||
      (a.unitNumber ?? "").localeCompare(b.unitNumber ?? "", undefined, { numeric: true }) ||
      a.label.localeCompare(b.label),
  );

  const hasTariff: Record<string, boolean> = {};
  for (const u of ["WATER", "ELECTRICITY"] as UtilityType[]) {
    hasTariff[u] = !!resolveTariffForPeriod(tariffs.filter((t) => t.utility === u), year, month);
  }
  return { rows, settings: settingMap, hasTariff };
}

// ─── Submit / edit ───────────────────────────────────────────────────────────

/** The unit's occupant on the reading date (null = vacant → never billed). */
async function occupantOn(unitId: string | null, readingDate: Date): Promise<string | null> {
  if (!unitId) return null;
  const tenants = await prisma.tenant.findMany({
    where: {
      unitId,
      leaseStart: { lte: readingDate },
      OR: [{ vacatedDate: null }, { vacatedDate: { gte: readingDate } }],
    },
    orderBy: [{ isActive: "desc" }, { leaseStart: "desc" }],
    select: { id: true, isActive: true, vacatedDate: true },
    take: 5,
  });
  // An inactive tenant without a vacate date is a stale record, not an occupant.
  const t = tenants.find((x) => x.isActive || x.vacatedDate);
  return t?.id ?? null;
}

async function derivedPrevious(meterId: string, openingReading: number, year: number, month: number): Promise<number> {
  const prev = await prisma.meterReading.findFirst({
    where: { meterId, status: { not: "VOID" }, ...beforePeriodWhere(year, month) },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    select: { currentReading: true },
  });
  return prev?.currentReading ?? openingReading;
}

export interface SubmitReadingInput {
  meterId: string;
  periodYear: number;
  periodMonth: number;
  readingDate: Date;
  currentReading: number;
  notes?: string | null;
  photoPaths?: string[];
  /** Manager tier only. */
  previousOverride?: number | null;
  previousOverrideReason?: string | null;
}

export async function submitReading(input: SubmitReadingInput, session: Session) {
  const meter = await prisma.utilityMeter.findUnique({
    where: { id: input.meterId },
    select: { id: true, unitId: true, role: true, openingReading: true, isActive: true },
  });
  if (!meter || !meter.isActive) return fail(404, "Meter not found");

  const [existing, later] = await Promise.all([
    prisma.meterReading.findMany({
      where: { meterId: meter.id, periodYear: input.periodYear, periodMonth: input.periodMonth },
      select: { id: true, status: true },
    }),
    prisma.meterReading.findFirst({
      where: { meterId: meter.id, status: { not: "VOID" }, ...afterPeriodWhere(input.periodYear, input.periodMonth) },
      select: { id: true },
    }),
  ]);
  if (existing.some((r) => r.status !== "VOID")) {
    return fail(409, "This meter already has a reading for that month. Edit it instead.", "READING_EXISTS");
  }
  if (later) {
    return fail(409, "A later month has already been read for this meter, so this month can no longer be added.", "LATER_READING_EXISTS");
  }

  let previous = await derivedPrevious(meter.id, meter.openingReading, input.periodYear, input.periodMonth);
  let overrideReason: string | null = null;
  if (input.previousOverride != null) {
    if (!canSeeUtilityMoney(session)) return fail(403, "Only a manager can override the previous reading.");
    if (!input.previousOverrideReason?.trim()) {
      return fail(400, "Give a reason for overriding the previous reading (e.g. meter replaced).");
    }
    previous = input.previousOverride;
    overrideReason = input.previousOverrideReason.trim();
  }

  const data = {
    meterId: meter.id,
    periodYear: input.periodYear,
    periodMonth: input.periodMonth,
    readingDate: input.readingDate,
    previousReading: previous,
    currentReading: input.currentReading,
    consumption: calcConsumption(previous, input.currentReading),
    status: "SUBMITTED" as const,
    tenantId: meter.role === "UNIT" ? await occupantOn(meter.unitId, input.readingDate) : null,
    invoiceId: null,
    supplyRate: null,
    fuelRate: null,
    ratePerUnit: null,
    amount: null,
    approvedAt: null,
    approvedByName: null,
    approvedByUserId: null,
    readByUserId: session.user.id ?? null,
    readByName: session.user.name ?? session.user.email ?? null,
    photoPaths: input.photoPaths ?? [],
    notes: input.notes?.trim() || null,
    previousOverrideReason: overrideReason,
  };

  // A VOID row for the period is reused rather than piling up duplicates.
  const voided = existing.find((r) => r.status === "VOID");
  const reading = voided
    ? await prisma.meterReading.update({ where: { id: voided.id }, data })
    : await prisma.meterReading.create({ data });
  return { ok: true as const, reading };
}

export interface UpdateReadingInput {
  currentReading?: number;
  readingDate?: Date;
  notes?: string | null;
  addPhotoPaths?: string[];
  previousOverride?: number | null;
  previousOverrideReason?: string | null;
}

export async function updateReading(id: string, input: UpdateReadingInput, session: Session) {
  const reading = await prisma.meterReading.findUnique({
    where: { id },
    include: { invoice: { select: { status: true } }, meter: { select: { unitId: true, role: true } } },
  });
  if (!reading || reading.status === "VOID") return fail(404, "Reading not found");
  const manager = canSeeUtilityMoney(session);

  if (!manager) {
    if (reading.readByUserId !== session.user.id) return fail(403, "You can only change readings you submitted.");
    if (reading.status !== "SUBMITTED") return fail(409, "This reading has been approved and can no longer be changed.", "READING_APPROVED");
  }
  if (isReadingBilled(reading)) {
    return fail(409, "This reading is already on an invoice. Void it to correct it.", "READING_BILLED");
  }
  const later = await prisma.meterReading.findFirst({
    where: { meterId: reading.meterId, status: { not: "VOID" }, ...afterPeriodWhere(reading.periodYear, reading.periodMonth) },
    select: { id: true },
  });
  if (later) {
    return fail(409, "A later month has already been read for this meter, so this reading is locked.", "LATER_READING_EXISTS");
  }

  let previous = reading.previousReading;
  let overrideReason = reading.previousOverrideReason;
  if (input.previousOverride !== undefined) {
    if (!manager) return fail(403, "Only a manager can override the previous reading.");
    if (input.previousOverride === null) {
      const meter = await prisma.utilityMeter.findUnique({ where: { id: reading.meterId }, select: { openingReading: true } });
      previous = await derivedPrevious(reading.meterId, meter?.openingReading ?? 0, reading.periodYear, reading.periodMonth);
      overrideReason = null;
    } else {
      if (!input.previousOverrideReason?.trim()) {
        return fail(400, "Give a reason for overriding the previous reading (e.g. meter replaced).");
      }
      previous = input.previousOverride;
      overrideReason = input.previousOverrideReason.trim();
    }
  }

  const current = input.currentReading ?? reading.currentReading;
  const readingDate = input.readingDate ?? reading.readingDate;
  // Only a change to the numbers sends an approved reading back for review —
  // adding a photo or a note leaves the approval (and its price) alone.
  const numbersChanged =
    current !== reading.currentReading ||
    previous !== reading.previousReading ||
    readingDate.getTime() !== reading.readingDate.getTime();
  const updated = await prisma.meterReading.update({
    where: { id },
    data: {
      currentReading: current,
      previousReading: previous,
      previousOverrideReason: overrideReason,
      consumption: calcConsumption(previous, current),
      readingDate,
      ...(input.readingDate && reading.meter.role === "UNIT"
        ? { tenantId: await occupantOn(reading.meter.unitId, readingDate) }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.addPhotoPaths?.length ? { photoPaths: [...reading.photoPaths, ...input.addPhotoPaths].slice(0, 3) } : {}),
      ...(numbersChanged
        ? {
            status: "SUBMITTED" as const,
            supplyRate: null,
            fuelRate: null,
            ratePerUnit: null,
            amount: null,
            approvedAt: null,
            approvedByName: null,
            approvedByUserId: null,
            invoiceId: null,
          }
        : {}),
    },
  });
  return { ok: true as const, reading: updated };
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export async function approveReadings(ids: string[], accessiblePropertyIds: string[], session: Session) {
  const readings = await prisma.meterReading.findMany({
    where: { id: { in: ids } },
    include: {
      meter: { select: { propertyId: true, utility: true, role: true, label: true, ratePerUnitOverride: true, unit: { select: { unitNumber: true } } } },
    },
  });
  const propertyIds = Array.from(new Set(readings.map((r) => r.meter.propertyId)));
  const tariffs = await prisma.utilityTariff.findMany({ where: { propertyId: { in: propertyIds } } });

  const approved: string[] = [];
  const errors: { id: string; meter: string; error: string }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [];
  const now = new Date();

  for (const r of readings) {
    const name = `${r.meter.unit?.unitNumber ? `Unit ${r.meter.unit.unitNumber} · ` : ""}${r.meter.label}`;
    if (!accessiblePropertyIds.includes(r.meter.propertyId)) {
      errors.push({ id: r.id, meter: name, error: "No access to this property" });
      continue;
    }
    if (r.status !== "SUBMITTED") {
      errors.push({ id: r.id, meter: name, error: r.status === "APPROVED" ? "Already approved" : "Reading was voided" });
      continue;
    }
    const anomalies = readingAnomalies({ consumption: r.consumption, occupied: false, history: [] });
    if (blocksApproval(anomalies)) {
      errors.push({ id: r.id, meter: name, error: anomalies[0].message });
      continue;
    }

    // Only unit meters are priced; bulk / common meters feed reconciliation.
    let rates: ReturnType<typeof resolveReadingRates> = null;
    if (r.meter.role === "UNIT") {
      const tariff = resolveTariffForPeriod(
        tariffs.filter((t) => t.propertyId === r.meter.propertyId && t.utility === r.meter.utility),
        r.periodYear,
        r.periodMonth,
      );
      rates = resolveReadingRates(tariff, r.meter.ratePerUnitOverride);
      if (!rates) {
        errors.push({ id: r.id, meter: name, error: `No ${r.meter.utility.toLowerCase()} tariff is set for this month. Add one under Meters & tariffs.` });
        continue;
      }
    }

    ops.push(
      prisma.meterReading.update({
        where: { id: r.id },
        data: {
          status: "APPROVED",
          approvedAt: now,
          approvedByUserId: session.user.id ?? null,
          approvedByName: session.user.name ?? session.user.email ?? null,
          supplyRate: rates?.supplyRate ?? null,
          fuelRate: rates?.fuelRate ?? null,
          ratePerUnit: rates?.ratePerUnit ?? null,
          amount: rates ? calcReadingCharge(r.consumption, rates.ratePerUnit) : null,
        },
      }),
    );
    approved.push(r.id);
  }
  for (const id of ids) {
    if (!readings.some((r) => r.id === id)) errors.push({ id, meter: "—", error: "Reading not found" });
  }
  if (ops.length) await prisma.$transaction(ops);
  return { approved, errors };
}

// ─── Invoice amounts ─────────────────────────────────────────────────────────

const INVOICE_LINES_SELECT = {
  id: true, invoiceNumber: true, status: true, paidAmount: true, tenantId: true,
  periodYear: true, periodMonth: true,
  rentAmount: true, serviceCharge: true, otherCharges: true, lateFeeAmount: true,
  waterAmount: true, electricityAmount: true, depositAmount: true, leaseFee: true,
  _count: { select: { incomeEntries: true } },
} as const;

// Money columns arrive as plain numbers (prisma-decimal-extension), which the
// raw Prisma payload type does not know — hence the hand-written shape.
interface InvoiceLinesRow {
  id: string; invoiceNumber: string; status: string; paidAmount: number | null; tenantId: string;
  periodYear: number; periodMonth: number;
  rentAmount: number; serviceCharge: number; otherCharges: number; lateFeeAmount: number;
  waterAmount: number; electricityAmount: number; depositAmount: number; leaseFee: number;
  _count: { incomeEntries: number };
}

function invoiceChangeable(inv: InvoiceLinesRow): boolean {
  return canChangeInvoiceUtilities({ status: inv.status, paidAmount: inv.paidAmount, incomeEntryCount: inv._count.incomeEntries });
}

// ─── Void ────────────────────────────────────────────────────────────────────

export async function voidReading(id: string, reason: string, session: Session) {
  const reading = await prisma.meterReading.findUnique({
    where: { id },
    include: { meter: { select: { utility: true, propertyId: true } }, invoice: { select: INVOICE_LINES_SELECT } },
  });
  if (!reading || reading.status === "VOID") return fail(404, "Reading not found");

  const later = await prisma.meterReading.findFirst({
    where: { meterId: reading.meterId, status: { not: "VOID" }, ...afterPeriodWhere(reading.periodYear, reading.periodMonth) },
    select: { id: true },
  });
  if (later) {
    return fail(409, "A later month has already been read for this meter. Void the later reading first.", "LATER_READING_EXISTS");
  }

  const voidOp = prisma.meterReading.update({
    where: { id },
    data: {
      status: "VOID",
      invoiceId: null,
      notes: [reading.notes, `Voided by ${session.user.name ?? session.user.email ?? "manager"}: ${reason.trim()}`].filter(Boolean).join("\n"),
    },
  });

  const inv = reading.invoice;
  if (!inv || inv.status === "CANCELLED") {
    await prisma.$transaction([voidOp]);
    return { ok: true as const, invoice: null };
  }
  if (!invoiceChangeable(inv)) {
    return fail(
      409,
      `This reading is on invoice ${inv.invoiceNumber}, which already has a payment recorded. Revert the invoice to unpaid first, then void the reading.`,
      "INVOICE_HAS_PAYMENTS",
    );
  }

  const amount = reading.amount ?? 0;
  const lines = {
    ...inv,
    waterAmount: reading.meter.utility === "WATER" ? round2(Math.max(inv.waterAmount - amount, 0)) : inv.waterAmount,
    electricityAmount: reading.meter.utility === "ELECTRICITY" ? round2(Math.max(inv.electricityAmount - amount, 0)) : inv.electricityAmount,
  };
  const total = invoiceLinesTotal(lines);
  await prisma.$transaction([
    voidOp,
    prisma.invoice.update({
      where: { id: inv.id },
      data: {
        waterAmount: lines.waterAmount,
        electricityAmount: lines.electricityAmount,
        totalAmount: total,
        // A utilities-only invoice with nothing left on it is withdrawn.
        ...(total <= 0 ? { status: "CANCELLED" as const } : {}),
      },
    }),
  ]);
  return { ok: true as const, invoice: { id: inv.id, invoiceNumber: inv.invoiceNumber, totalAmount: total, cancelled: total <= 0 } };
}

// ─── Billing ─────────────────────────────────────────────────────────────────

export interface UnbilledForTenant {
  readingIds: string[];
  waterAmount: number;
  electricityAmount: number;
}

/**
 * APPROVED unit readings with a charge that are not on a live invoice and
 * whose period is strictly before the invoice period, grouped by tenant.
 */
export async function unbilledApprovedReadings(opts: {
  tenantIds?: string[];
  propertyId?: string;
  invoiceYear: number;
  invoiceMonth: number;
}): Promise<Map<string, UnbilledForTenant>> {
  const rows = await prisma.meterReading.findMany({
    where: {
      status: "APPROVED",
      amount: { gt: 0 },
      tenantId: opts.tenantIds ? { in: opts.tenantIds } : { not: null },
      meter: { role: "UNIT", ...(opts.propertyId ? { propertyId: opts.propertyId } : {}) },
      AND: [NOT_BILLED, beforePeriodWhere(opts.invoiceYear, opts.invoiceMonth)],
    },
    select: { id: true, tenantId: true, amount: true, meter: { select: { utility: true } } },
  });
  const byTenant = new Map<string, { id: string; utility: UtilityType; amount: number | null }[]>();
  for (const r of rows) {
    if (!r.tenantId) continue;
    const list = byTenant.get(r.tenantId) ?? [];
    list.push({ id: r.id, utility: r.meter.utility, amount: r.amount });
    byTenant.set(r.tenantId, list);
  }
  const out = new Map<string, UnbilledForTenant>();
  byTenant.forEach((list, tenantId) => {
    out.set(tenantId, { readingIds: list.map((r) => r.id), ...sumReadingsByUtility(list) });
  });
  return out;
}

export interface BillReadingsResult {
  /** Existing invoices that took the readings (resend when already SENT). */
  merged: { invoiceId: string; invoiceNumber: string; tenantName: string; status: string; added: number }[];
  /** Utilities-only invoices raised because no changeable invoice existed. */
  created: { invoiceId: string; invoiceNumber: string; tenantName: string; total: number }[];
  errors: { tenantName: string; error: string }[];
}

/**
 * Puts every approved, unbilled reading of a property onto an invoice of the
 * given period: merged into the tenant's invoice for that month when it can
 * still change (nothing paid), else a utilities-only invoice. Used by the
 * manager's "Bill approved readings" action and after auto invoice generation.
 */
export async function billApprovedReadings(opts: {
  propertyId: string;
  invoiceYear: number;
  invoiceMonth: number;
  status?: "DRAFT" | "SENT";
  dueDayOfMonth?: number;
}): Promise<BillReadingsResult> {
  const { propertyId, invoiceYear, invoiceMonth } = opts;
  const result: BillReadingsResult = { merged: [], created: [], errors: [] };
  const pending = await unbilledApprovedReadings({ propertyId, invoiceYear, invoiceMonth });
  if (pending.size === 0) return result;

  const tenantIds = Array.from(pending.keys());
  const [tenants, invoices] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    prisma.invoice.findMany({
      where: { tenantId: { in: tenantIds }, periodYear: invoiceYear, periodMonth: invoiceMonth, status: { not: "CANCELLED" } },
      select: INVOICE_LINES_SELECT,
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const periodStart = new Date(invoiceYear, invoiceMonth - 1, 1);
  const scheduledDue = new Date(invoiceYear, invoiceMonth - 1, opts.dueDayOfMonth ?? 5);
  const dueDate = scheduledDue.getTime() < Date.now() ? new Date(Date.now() + 7 * 86_400_000) : scheduledDue;
  const monthLabel = periodStart.toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  for (const tenantId of tenantIds) {
    const bill = pending.get(tenantId)!;
    const tenantName = tenants.find((t) => t.id === tenantId)?.name ?? "Tenant";
    try {
      // Prefer the rent invoice so utilities go out with the rent.
      const candidates = invoices.filter((i) => i.tenantId === tenantId && invoiceChangeable(i));
      const target = candidates.find((i) => i.rentAmount > 0) ?? candidates[0] ?? null;
      const connect = bill.readingIds.map((id) => ({ id }));

      if (target) {
        const lines = {
          ...target,
          waterAmount: round2(target.waterAmount + bill.waterAmount),
          electricityAmount: round2(target.electricityAmount + bill.electricityAmount),
        };
        await prisma.$transaction([
          prisma.invoice.update({
            where: { id: target.id },
            data: {
              waterAmount: lines.waterAmount,
              electricityAmount: lines.electricityAmount,
              totalAmount: invoiceLinesTotal(lines),
              meterReadings: { connect },
            },
          }),
        ]);
        result.merged.push({
          invoiceId: target.id,
          invoiceNumber: target.invoiceNumber,
          tenantName,
          status: target.status,
          added: round2(bill.waterAmount + bill.electricityAmount),
        });
        continue;
      }

      const invoiceNumber = await allocateInvoiceNumber(tenantId, periodStart);
      const total = round2(bill.waterAmount + bill.electricityAmount);
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          tenantId,
          periodYear: invoiceYear,
          periodMonth: invoiceMonth,
          rentAmount: 0,
          serviceCharge: 0,
          otherCharges: 0,
          waterAmount: bill.waterAmount,
          electricityAmount: bill.electricityAmount,
          totalAmount: total,
          dueDate,
          status: opts.status ?? "SENT",
          notes: `Water / electricity billed in ${monthLabel}`,
          meterReadings: { connect },
        },
        select: { id: true },
      });
      result.created.push({ invoiceId: invoice.id, invoiceNumber, tenantName, total });
    } catch (e) {
      result.errors.push({ tenantName, error: e instanceof Error ? e.message : "Could not bill the readings" });
    }
  }
  return result;
}

// ─── Auto-invoice hold ───────────────────────────────────────────────────────

/** Last day of the month on which auto invoice generation still waits. */
export const READINGS_HOLD_UNTIL_DAY = 5;

/**
 * Units whose rent invoice should wait: they have an active unit meter (on a
 * utility whose property setting holds invoices — the default) that has no
 * APPROVED reading for the month before the invoice period. Lets the
 * automation send utilities WITH the rent instead of racing the caretaker.
 */
export async function unitsAwaitingReadings(
  unitIds: string[],
  invoiceYear: number,
  invoiceMonth: number,
): Promise<Set<string>> {
  const waiting = new Set<string>();
  if (unitIds.length === 0) return waiting;
  const prev = invoiceMonth === 1 ? { year: invoiceYear - 1, month: 12 } : { year: invoiceYear, month: invoiceMonth - 1 };
  const meters = await prisma.utilityMeter.findMany({
    where: { unitId: { in: unitIds }, role: "UNIT", isActive: true },
    select: {
      unitId: true,
      utility: true,
      propertyId: true,
      readings: {
        where: { periodYear: prev.year, periodMonth: prev.month, status: "APPROVED" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (meters.length === 0) return waiting;
  const settings = await prisma.utilitySetting.findMany({
    where: { propertyId: { in: Array.from(new Set(meters.map((m) => m.propertyId))) } },
    select: { propertyId: true, utility: true, holdInvoicesForReadings: true },
  });
  for (const m of meters) {
    const setting = settings.find((s) => s.propertyId === m.propertyId && s.utility === m.utility);
    const holds = setting?.holdInvoicesForReadings ?? true;
    if (holds && m.readings.length === 0 && m.unitId) waiting.add(m.unitId);
  }
  return waiting;
}
