import { prisma } from "@/lib/prisma";
import { buildAgingSnapshot } from "@/lib/arrears-aging";
import { getWorkflow, getStageByIndex, computeDefaultStageSlaHours } from "@/lib/case-workflows";
import type { ArrearsStage, CaseStatus, Prisma } from "@prisma/client";

/**
 * Arrears reads and writes, on top of CaseThread.
 *
 * Arrears used to be modelled twice: an `ArrearsCase` row (with its own
 * `ArrearsStage` ladder and `ArrearsEscalation` history) driving /arrears, AND a
 * `CaseThread(caseType=ARREARS)` created by the ARREARS_7D automation. Nothing
 * linked them, so a tenant could sit at DEMAND_LETTER in one place and
 * `informal_reminder` in the other — a manager escalating on /arrears would see
 * their work apparently undone on /cases.
 *
 * CaseThread won because it carries the timeline, attachments, SLA clock,
 * assignment and approvals. `ArrearsCase` is retained read-only for rollback
 * (see `npm run arrears:consolidate`) but is no longer written to.
 */

/**
 * Legacy `ArrearsStage` → ARREARS_V1 stage key.
 *
 * The two ladders were neither the same length nor the same order: the enum ran
 * informal → demand letter → legal notice → eviction, while the workflow runs
 * informal → formal notice → demand letter → legal action. So this is a
 * reconciliation, not a rename. Mapping is monotonic in severity — a migrated
 * case never appears *less* escalated than it really was.
 */
export const LEGACY_STAGE_TO_KEY: Record<ArrearsStage, string> = {
  INFORMAL_REMINDER: "informal_reminder",
  DEMAND_LETTER: "demand_letter",
  LEGAL_NOTICE: "legal_action",
  EVICTION: "eviction",
  RESOLVED: "settled",
};

export interface ArrearsCaseRow {
  /** CaseThread id — what every action endpoint now takes. */
  id: string;
  tenantId: string;
  tenantName: string;
  unitNumber: string;
  phone: string | null;
  email: string | null;
  propertyId: string;
  propertyName: string;
  currency: string;
  status: CaseStatus;
  stageKey: string;
  stageLabel: string;
  stageIndex: number;
  /**
   * Live outstanding balance from unpaid invoices, via the same
   * `buildAgingSnapshot` engine the aging table and reports use — so the figure
   * on this page can't disagree with the one in the report. Replaces the old
   * manually-typed `ArrearsCase.amountOwed`, which went stale the moment a
   * tenant part-paid.
   */
  amountOwed: number;
  oldestAgeDays: number;
  invoiceCount: number;
  assignedToUserId: string | null;
  lastActivityAt: string;
  stageStartedAt: string | null;
  latePaymentInterestRate: number;
  isResolved: boolean;
}

/** Every arrears case across the given properties, newest activity first. */
export async function buildArrearsCases(propertyIds: string[]): Promise<ArrearsCaseRow[]> {
  if (propertyIds.length === 0) return [];

  const wf = getWorkflow("ARREARS");

  const [threads, aging, agreements] = await Promise.all([
    prisma.caseThread.findMany({
      where: { caseType: "ARREARS", propertyId: { in: propertyIds } },
      select: {
        id: true,
        subjectId: true,
        propertyId: true,
        status: true,
        stage: true,
        currentStageIndex: true,
        stageStartedAt: true,
        assignedToUserId: true,
        lastActivityAt: true,
        property: { select: { name: true, currency: true } },
      },
      orderBy: [{ currentStageIndex: "desc" }, { lastActivityAt: "desc" }],
    }),
    buildAgingSnapshot(propertyIds),
    prisma.managementAgreement.findMany({
      where: { propertyId: { in: propertyIds } },
      select: { propertyId: true, latePaymentInterestRate: true },
    }),
  ]);

  if (threads.length === 0) return [];

  // subjectId on an ARREARS thread is the tenant id.
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: threads.map((t) => t.subjectId) } },
    select: {
      id: true, name: true, phone: true, email: true,
      unit: { select: { unitNumber: true } },
    },
  });

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const agingByTenant = new Map(aging.rows.map((r) => [r.tenantId, r]));
  const rateByProperty = new Map(
    agreements.map((a) => [a.propertyId, a.latePaymentInterestRate])
  );

  return threads.map((t) => {
    const tenant = tenantById.get(t.subjectId);
    const row = agingByTenant.get(t.subjectId);
    const stage = getStageByIndex(wf, t.currentStageIndex);

    return {
      id: t.id,
      tenantId: t.subjectId,
      tenantName: tenant?.name ?? "(deleted tenant)",
      unitNumber: tenant?.unit?.unitNumber ?? "—",
      phone: tenant?.phone ?? null,
      email: tenant?.email ?? null,
      propertyId: t.propertyId,
      propertyName: t.property.name,
      currency: t.property.currency,
      status: t.status,
      stageKey: stage?.key ?? "informal_reminder",
      // Prefer the workflow's label; fall back to the stored string if an index
      // ever points outside the current stage list.
      stageLabel: stage?.label ?? t.stage ?? "Informal reminder",
      stageIndex: t.currentStageIndex,
      // A settled case legitimately owes nothing, so absence means zero.
      amountOwed: row?.outstanding ?? 0,
      oldestAgeDays: row?.oldestAgeDays ?? 0,
      invoiceCount: row?.invoiceCount ?? 0,
      assignedToUserId: t.assignedToUserId,
      lastActivityAt: t.lastActivityAt.toISOString(),
      stageStartedAt: t.stageStartedAt?.toISOString() ?? null,
      latePaymentInterestRate: rateByProperty.get(t.propertyId) ?? 12,
      isResolved: t.status === "RESOLVED" || t.status === "CLOSED",
    };
  });
}

/**
 * Opens an arrears case for a tenant, or returns the existing open one.
 *
 * Shared by `POST /api/arrears` and the ARREARS_7D automation so both produce
 * identical threads — the divergence that caused the original duplication.
 */
export async function findOpenArrearsCase(tenantId: string) {
  return prisma.caseThread.findFirst({
    where: {
      caseType: "ARREARS",
      subjectId: tenantId,
      status: { notIn: ["RESOLVED", "CLOSED"] },
    },
    select: { id: true },
  });
}

export function initialArrearsCaseData(opts: {
  tenantId: string;
  tenantName: string;
  propertyId: string;
  organizationId: string;
  unitId?: string | null;
}): Prisma.CaseThreadUncheckedCreateInput {
  const wf = getWorkflow("ARREARS");
  return {
    caseType: "ARREARS",
    subjectId: opts.tenantId,
    propertyId: opts.propertyId,
    unitId: opts.unitId ?? null,
    organizationId: opts.organizationId,
    title: `Arrears — ${opts.tenantName}`,
    status: "OPEN",
    workflowKey: wf.key,
    currentStageIndex: 0,
    stage: wf.stages[0].label,
    stageStartedAt: new Date(),
    stageSlaHours: computeDefaultStageSlaHours(wf) as Prisma.InputJsonValue,
    waitingOn: "MANAGER",
  };
}
