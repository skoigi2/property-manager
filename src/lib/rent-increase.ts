import "server-only";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency";
import { buildRentIncreaseNotice } from "@/lib/rent-increase-notice";
import {
  nextRentReview,
  noticeGivenDays,
  hasEscalationTerms,
  describeEscalation,
  type EscalationTerms,
  type RentReview,
} from "@/lib/rent-escalation";

/**
 * Rent increases on the server: the tenant's review position, scheduling an
 * increase (a RentHistory row with appliedAt NULL), skipping a review, and the
 * daily apply that switches Tenant.monthlyRent on the effective date.
 *
 * Billing never waits for the apply: invoices, ledgers and reports resolve
 * rent from RentHistory by effective date (rent-resolution.ts), so a scheduled
 * row bills from its month. The apply is for everything that reads
 * monthlyRent directly (tenant list, rent roll, portal, invoice form).
 */

export const DEFAULT_NOTICE_DAYS = 90;

export class RentIncreaseError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
  }
}

const tenantSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  monthlyRent: true,
  leaseStart: true,
  leaseEnd: true,
  escalationType: true,
  escalationRate: true,
  escalationAmount: true,
  escalationIntervalYears: true,
  escalationAnchorDate: true,
  escalationNoticeDays: true,
  unit: {
    select: {
      id: true,
      unitNumber: true,
      propertyId: true,
      property: {
        select: {
          id: true,
          name: true,
          currency: true,
          organizationId: true,
          agreement: { select: { rentIncreaseNoticeDays: true } },
        },
      },
    },
  },
  rentHistory: { orderBy: { effectiveDate: "asc" as const } },
};

export async function loadRentReviewContext(tenantId: string, today: Date = new Date()) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: tenantSelect });
  if (!tenant) return null;
  const noticeDays =
    tenant.escalationNoticeDays ?? tenant.unit.property.agreement?.rentIncreaseNoticeDays ?? DEFAULT_NOTICE_DAYS;
  const terms: EscalationTerms = {
    leaseStart: tenant.leaseStart,
    leaseEnd: tenant.leaseEnd,
    escalationType: tenant.escalationType,
    escalationRate: tenant.escalationRate,
    escalationAmount: tenant.escalationAmount,
    escalationIntervalYears: tenant.escalationIntervalYears,
    escalationAnchorDate: tenant.escalationAnchorDate,
  };
  const review: RentReview | null = tenant.isActive
    ? nextRentReview(terms, tenant.rentHistory, tenant.monthlyRent, noticeDays, today)
    : null;
  const scheduled = tenant.rentHistory.filter((h) => h.appliedAt === null);
  return { tenant, terms, noticeDays, review, scheduled, hasTerms: hasEscalationTerms(terms) };
}

type Actor = { userId: string; email?: string | null; name?: string | null; organizationId?: string | null };

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * Schedule an increase. Refuses a date that isn't in the future, a second
 * pending increase, and (unless acknowledged) less notice than the lease
 * requires. A tenant with no rent history first gets a baseline row at lease
 * start, so months before the increase keep resolving the old rent after
 * the apply switches monthlyRent.
 */
export async function scheduleRentIncrease(
  tenantId: string,
  input: { newRent: number; effectiveDate: Date; reason?: string | null; acceptShortNotice?: boolean },
  actor: Actor,
) {
  const ctx = await loadRentReviewContext(tenantId);
  if (!ctx) throw new RentIncreaseError("Tenant not found", 404);
  const { tenant, noticeDays, scheduled } = ctx;
  if (!tenant.isActive) throw new RentIncreaseError("This tenant has moved out.");

  const effective = new Date(input.effectiveDate.getFullYear(), input.effectiveDate.getMonth(), input.effectiveDate.getDate());
  if (effective.getTime() <= startOfToday().getTime()) {
    throw new RentIncreaseError("An increase can't start today or in the past — pick a future date.");
  }
  if (tenant.leaseEnd && effective.getTime() > new Date(tenant.leaseEnd).getTime()) {
    throw new RentIncreaseError(`The lease ends on ${formatDate(tenant.leaseEnd)} — a later increase belongs in the renewal.`);
  }
  if (scheduled.length > 0) {
    throw new RentIncreaseError(
      `An increase to ${formatCurrency(scheduled[0].monthlyRent, tenant.unit.property.currency)} from ${formatDate(scheduled[0].effectiveDate)} is already scheduled — cancel it first.`,
      409,
      "ALREADY_SCHEDULED",
    );
  }
  if (!(input.newRent > 0)) throw new RentIncreaseError("Enter the new monthly rent.");
  const given = noticeGivenDays(effective);
  if (given < noticeDays && !input.acceptShortNotice) {
    throw new RentIncreaseError(
      `That gives ${given} days' notice; the lease requires ${noticeDays}.`,
      409,
      "SHORT_NOTICE",
    );
  }

  const ops = [];
  if (tenant.rentHistory.length === 0) {
    ops.push(
      prisma.rentHistory.create({
        data: {
          tenantId,
          monthlyRent: tenant.monthlyRent,
          effectiveDate: tenant.leaseStart,
          reason: "Rent at lease start",
          createdByName: actor.name ?? actor.email ?? null,
        },
      }),
    );
  }
  ops.push(
    prisma.rentHistory.create({
      data: {
        tenantId,
        monthlyRent: input.newRent,
        effectiveDate: effective,
        reason: input.reason?.trim() || "Rent increase",
        appliedAt: null,
        isEscalation: true,
        createdByName: actor.name ?? actor.email ?? null,
      },
    }),
  );
  const rows = await prisma.$transaction(ops);
  const row = rows[rows.length - 1];

  await clearOpenRentIncreaseHints(tenantId);
  await logAudit({
    userId: actor.userId,
    userEmail: actor.email,
    organizationId: actor.organizationId ?? tenant.unit.property.organizationId,
    action: "CREATE",
    resource: "RentIncrease",
    resourceId: row.id,
    after: { tenantId, from: tenant.monthlyRent, to: input.newRent, effectiveDate: effective, noticeDays: given, shortNotice: given < noticeDays },
  });
  return row;
}

/**
 * Record that a review happened with no increase: a RentHistory row at the
 * current rent dated the review, which moves the schedule to the next review.
 */
export async function skipRentReview(tenantId: string, note: string | null, actor: Actor) {
  const ctx = await loadRentReviewContext(tenantId);
  if (!ctx) throw new RentIncreaseError("Tenant not found", 404);
  if (!ctx.review) throw new RentIncreaseError("There is no rent review due for this tenant.");
  const ops = [];
  if (ctx.tenant.rentHistory.length === 0) {
    ops.push(prisma.rentHistory.create({
      data: { tenantId, monthlyRent: ctx.tenant.monthlyRent, effectiveDate: ctx.tenant.leaseStart, reason: "Rent at lease start" },
    }));
  }
  ops.push(prisma.rentHistory.create({
    data: {
      tenantId,
      monthlyRent: ctx.review.baseRent,
      effectiveDate: ctx.review.reviewDate,
      reason: `Rent review ${formatDate(ctx.review.reviewDate)} — no increase${note?.trim() ? ` (${note.trim()})` : ""}`,
      isEscalation: true,
      createdByName: actor.name ?? actor.email ?? null,
    },
  }));
  const rows = await prisma.$transaction(ops);
  await clearOpenRentIncreaseHints(tenantId);
  await logAudit({
    userId: actor.userId,
    userEmail: actor.email,
    organizationId: actor.organizationId ?? ctx.tenant.unit.property.organizationId,
    action: "CREATE",
    resource: "RentIncrease",
    resourceId: rows[rows.length - 1].id,
    after: { tenantId, skippedReview: ctx.review.reviewDate, note },
  });
}

export async function cancelScheduledIncrease(tenantId: string, historyId: string, actor: Actor) {
  const row = await prisma.rentHistory.findFirst({ where: { id: historyId, tenantId } });
  if (!row) throw new RentIncreaseError("Not found", 404);
  if (row.appliedAt !== null) throw new RentIncreaseError("This increase has already taken effect — record a correction in the rent history instead.", 409);
  await prisma.rentHistory.delete({ where: { id: historyId } });
  await logAudit({
    userId: actor.userId,
    userEmail: actor.email,
    organizationId: actor.organizationId,
    action: "DELETE",
    resource: "RentIncrease",
    resourceId: historyId,
    before: { tenantId, monthlyRent: row.monthlyRent, effectiveDate: row.effectiveDate, noticeSentAt: row.noticeSentAt },
  });
}

async function clearOpenRentIncreaseHints(tenantId: string) {
  await prisma.actionableHint.updateMany({
    where: { hintType: "RENT_INCREASE_DUE", tenantId, status: "ACTIVE" },
    data: { status: "ACTED_ON", actedAt: new Date() },
  });
}

/**
 * Daily (cron): switch Tenant.monthlyRent for every scheduled change whose
 * effective date has arrived. A vacated tenant's row is stamped without
 * touching the rent. Rows are applied oldest first, one transaction each.
 */
export async function applyDueRentIncreases(now: Date = new Date()): Promise<{ applied: number; skipped: number }> {
  const due = await prisma.rentHistory.findMany({
    // A unit owner pays no rent: a scheduled row left from before is never applied.
    where: { appliedAt: null, effectiveDate: { lte: now }, tenant: { isUnitOwner: false } },
    orderBy: { effectiveDate: "asc" },
    include: { tenant: { select: { id: true, isActive: true, monthlyRent: true, unit: { select: { property: { select: { organizationId: true } } } } } } },
  });
  let applied = 0;
  let skipped = 0;
  for (const row of due) {
    const stamp = prisma.rentHistory.update({ where: { id: row.id }, data: { appliedAt: now } });
    if (!row.tenant.isActive) {
      await stamp;
      skipped++;
      continue;
    }
    await prisma.$transaction([
      prisma.tenant.update({ where: { id: row.tenantId }, data: { monthlyRent: row.monthlyRent } }),
      stamp,
    ]);
    await logAudit({
      userId: "system",
      action: "UPDATE",
      resource: "Tenant",
      resourceId: row.tenantId,
      organizationId: row.tenant.unit.property.organizationId,
      before: { monthlyRent: row.tenant.monthlyRent },
      after: { monthlyRent: row.monthlyRent, rentHistoryId: row.id, reason: "Scheduled rent increase took effect" },
    });
    applied++;
  }
  return { applied, skipped };
}

export function ymd(d: Date | string): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/**
 * Everything the notice letter / email needs for one increase row. The notice
 * period stated is counted from today (the day it is downloaded or sent).
 */
export async function loadRentIncreaseNotice(tenantId: string, historyId: string) {
  const ctx = await loadRentReviewContext(tenantId);
  if (!ctx) return null;
  const row = ctx.tenant.rentHistory.find((h) => h.id === historyId);
  if (!row) return null;
  const org = ctx.tenant.unit.property.organizationId
    ? await prisma.organization.findUnique({ where: { id: ctx.tenant.unit.property.organizationId }, select: { name: true } })
    : null;

  const earlier = ctx.tenant.rentHistory.filter(
    (h) => h.id !== row.id && new Date(h.effectiveDate).getTime() < new Date(row.effectiveDate).getTime(),
  );
  const previous = row.appliedAt === null || earlier.length === 0 ? ctx.tenant.monthlyRent : earlier[earlier.length - 1].monthlyRent;
  const currency = ctx.tenant.unit.property.currency;
  const fmt = (n: number) => formatCurrency(n, currency);
  const diff = row.monthlyRent - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : 0;
  const senderName = org?.name ?? ctx.tenant.unit.property.name;
  const today = formatDate(new Date());

  const notice = buildRentIncreaseNotice({
    tenantName: ctx.tenant.name,
    unitNumber: ctx.tenant.unit.unitNumber,
    propertyName: ctx.tenant.unit.property.name,
    senderName,
    today,
    currentRent: fmt(previous),
    newRent: fmt(row.monthlyRent),
    change: `${diff >= 0 ? "+" : "-"} ${fmt(Math.abs(diff))}, ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    effectiveDate: formatDate(row.effectiveDate),
    leaseTerms: ctx.hasTerms ? describeEscalation(ctx.terms, fmt) : null,
    noticeDays: Math.max(0, noticeGivenDays(new Date(row.effectiveDate))),
    serviceChargeNote: null,
  });
  return {
    row,
    tenant: ctx.tenant,
    notice,
    pdfInput: {
      notice,
      senderName,
      propertyName: ctx.tenant.unit.property.name,
      today,
      tenantName: ctx.tenant.name,
      unitNumber: ctx.tenant.unit.unitNumber,
    },
  };
}
