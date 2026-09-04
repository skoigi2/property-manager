import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getWorkflow, computeDefaultStageSlaHours, getStageByIndex, advanceCase } from "@/lib/case-workflows";
import { computeCaseSlaDueDate } from "@/lib/cases";
import { appendCaseEvent, type CaseEventActor } from "@/lib/case-events";
import { hiddenCategoriesFor, complaintVisibleTo, decideComplaintAction, type ComplaintAction, type ComplaintCategory } from "@/lib/complaint-rules";
import { TENANT_DIRECTORY_SELECT } from "@/lib/tenant-projection";
import { notifyComplaintResolved } from "@/lib/complaint-notify";

/**
 * Server-side complaint helpers: the DTO shape, creation (domain row + linked
 * COMPLAINT case), and the named stage actions. Pure rules live in
 * complaint-rules.ts. Nothing here returns tenant financials.
 */

export const COMPLAINT_INCLUDE = {
  property:    { select: { id: true, name: true, currency: true } },
  unit:        { select: { id: true, unitNumber: true } },
  subjectUnit: { select: { id: true, unitNumber: true } },
  tenant:      { select: TENANT_DIRECTORY_SELECT },
  raisedBy:    { select: { id: true, name: true } },
  caseThread: {
    select: {
      id: true, caseType: true, status: true, stage: true, currentStageIndex: true, waitingOn: true,
      lastActivityAt: true, stageStartedAt: true, stageSlaHours: true, waitingPausedSeconds: true,
      terminalReason: true, bypassedAtStage: true, assignedTo: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TenantComplaintInclude;

export type ComplaintRow = Prisma.TenantComplaintGetPayload<{ include: typeof COMPLAINT_INCLUDE }>;

export function complaintToDto(c: ComplaintRow) {
  const ct = c.caseThread;
  const slaDueAt = ct
    ? computeCaseSlaDueDate({
        caseType: ct.caseType, status: ct.status, currentStageIndex: ct.currentStageIndex,
        stageStartedAt: ct.stageStartedAt, stageSlaHours: ct.stageSlaHours, waitingPausedSeconds: ct.waitingPausedSeconds,
      })
    : null;
  return {
    id: c.id,
    propertyId: c.propertyId,
    property: c.property,
    unit: c.unit,
    subjectUnit: c.subjectUnit,
    tenant: c.tenant,
    category: c.category,
    title: c.title,
    description: c.description,
    source: c.source,
    raisedBy: c.raisedBy,
    raisedByName: c.raisedByName,
    acknowledgedAt: c.acknowledgedAt,
    resolvedAt: c.resolvedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    caseThread: ct
      ? {
          id: ct.id, status: ct.status, stage: ct.stage, currentStageIndex: ct.currentStageIndex,
          waitingOn: ct.waitingOn, lastActivityAt: ct.lastActivityAt, terminalReason: ct.terminalReason,
          bypassedAtStage: ct.bypassedAtStage, assignedTo: ct.assignedTo,
          slaDueAt: slaDueAt?.toISOString() ?? null,
        }
      : null,
  };
}

/** Prisma where-fragment hiding categories the role must never see. */
export function complaintCategoryFilter(orgRole: string | null | undefined): Prisma.TenantComplaintWhereInput {
  const hidden = hiddenCategoriesFor(orgRole);
  return hidden.length ? { category: { notIn: hidden } } : {};
}

// ─── Creation ────────────────────────────────────────────────────────────────

export interface CreateComplaintArgs {
  propertyId: string;
  organizationId: string;
  unitId?: string | null;
  tenantId?: string | null;
  subjectUnitId?: string | null;
  category: ComplaintCategory;
  title: string;
  description?: string | null;
  source: "STAFF" | "PORTAL";
  raisedByUserId?: string | null;
  raisedByName: string;
  /** Timeline actor for the first COMMENT (staff session, or the tenant for PORTAL). */
  actor: CaseEventActor;
}

/**
 * Creates the complaint, its COMPLAINT_V1 case (workflowKey + stageSlaHours
 * set so the SLA cron sees it, `received` SLA from the agreement), links the
 * two and writes the first COMMENT. Sequential awaits — callback-form
 * $transaction is pgBouncer-incompatible.
 */
export async function createComplaint(args: CreateComplaintArgs): Promise<ComplaintRow> {
  const wf = getWorkflow("COMPLAINT");
  const agreement = await prisma.managementAgreement.findUnique({
    where: { propertyId: args.propertyId },
    select: { kpiEmergencyResponseHrs: true, kpiStandardResponseHrs: true },
  });

  const complaint = await prisma.tenantComplaint.create({
    data: {
      propertyId: args.propertyId,
      organizationId: args.organizationId,
      unitId: args.unitId ?? null,
      tenantId: args.tenantId ?? null,
      subjectUnitId: args.subjectUnitId ?? null,
      category: args.category,
      title: args.title,
      description: args.description ?? null,
      source: args.source,
      raisedByUserId: args.raisedByUserId ?? null,
      raisedByName: args.raisedByName,
    },
  });

  const now = new Date();
  const thread = await prisma.caseThread.create({
    data: {
      caseType: "COMPLAINT",
      subjectId: complaint.id,
      propertyId: args.propertyId,
      unitId: args.subjectUnitId ?? args.unitId ?? null,
      organizationId: args.organizationId,
      title: args.title,
      status: "OPEN",
      workflowKey: wf.key,
      currentStageIndex: 0,
      stage: wf.stages[0].label,
      stageStartedAt: now,
      lastActivityAt: now,
      stageSlaHours: computeDefaultStageSlaHours(wf, { agreement }) as Prisma.InputJsonValue,
      waitingOn: "MANAGER",
    },
  });

  await prisma.tenantComplaint.update({ where: { id: complaint.id }, data: { caseThreadId: thread.id } });

  if (args.description?.trim()) {
    await appendCaseEvent({
      threadId: thread.id,
      organizationId: args.organizationId,
      actor: args.actor,
      body: args.description.trim(),
      // The complainant's own words are always visible to them in the portal.
      meta: { visibleToTenant: true, source: args.source },
    });
  }

  if (args.actor.userId) {
    await logAudit({
      userId: args.actor.userId,
      userEmail: args.actor.email,
      action: "CREATE",
      resource: "TenantComplaint",
      resourceId: complaint.id,
      organizationId: args.organizationId,
      after: { category: args.category, title: args.title, source: args.source, tenantId: args.tenantId ?? null, caseThreadId: thread.id },
    });
  }

  return (await prisma.tenantComplaint.findUniqueOrThrow({ where: { id: complaint.id }, include: COMPLAINT_INCLUDE }));
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function applyComplaintAction(input: {
  complaint: ComplaintRow;
  action: ComplaintAction;
  note?: string | null;
  orgRole: string | null | undefined;
  isSuperAdmin: boolean;
  actor: CaseEventActor;
}): Promise<{ ok: true } | { ok: false; status: number; error: string; code: string }> {
  const ct = input.complaint.caseThread;
  if (!ct) return { ok: false, status: 409, error: "This complaint has no case behind it.", code: "NO_CASE" };

  const decision = decideComplaintAction({
    orgRole: input.orgRole, isSuperAdmin: input.isSuperAdmin, action: input.action,
    currentStageIndex: ct.currentStageIndex, note: input.note,
  });
  if (!decision.ok) return decision;

  const now = new Date();
  if (decision.reopen) {
    // Mirror of the regress route: un-snap terminal status, clear the
    // terminal reason, restart the stage clock, log the reason.
    const wf = getWorkflow("COMPLAINT");
    const target = getStageByIndex(wf, decision.toIndex)!;
    await prisma.$transaction([
      prisma.caseThread.update({
        where: { id: ct.id },
        data: {
          currentStageIndex: decision.toIndex, stage: target.label, stageStartedAt: now, lastActivityAt: now,
          waitingOn: target.requiresAction ?? "MANAGER", status: "IN_PROGRESS", terminalReason: null, bypassedAtStage: null,
        },
      }),
      prisma.caseEvent.create({
        data: {
          caseThreadId: ct.id, kind: "STAGE_CHANGE",
          actorUserId: input.actor.userId, actorEmail: input.actor.email, actorName: input.actor.name,
          body: `Reopened — ${input.note!.trim()}`,
          meta: { from: ct.currentStageIndex, to: decision.toIndex, toKey: decision.toKey, reason: input.note!.trim(), regression: true } as Prisma.InputJsonValue,
        },
      }),
      prisma.tenantComplaint.update({ where: { id: input.complaint.id }, data: { resolvedAt: null } }),
    ]);
  } else {
    await advanceCase(ct.id, decision.toIndex, {
      actorUserId: input.actor.userId, actorEmail: input.actor.email, actorName: input.actor.name,
      note: input.note?.trim() || undefined,
    });
    const stamps: Prisma.TenantComplaintUpdateInput = {};
    if (input.action === "acknowledge" && !input.complaint.acknowledgedAt) stamps.acknowledgedAt = now;
    if (input.action === "resolve" || input.action === "close") {
      if (!input.complaint.acknowledgedAt) stamps.acknowledgedAt = now;
      if (!input.complaint.resolvedAt) stamps.resolvedAt = now;
    }
    if (Object.keys(stamps).length) await prisma.tenantComplaint.update({ where: { id: input.complaint.id }, data: stamps });

    if (input.action === "resolve") {
      const resolutionNote = input.note?.trim() || null;
      // The resolution note is the outcome message: it is written as a
      // tenant-visible COMMENT (so the portal shows it) and emailed to a
      // portal complainant (NOTIFY_COMPLAINT_RESOLVED toggle).
      if (resolutionNote) {
        await appendCaseEvent({
          threadId: ct.id, organizationId: input.complaint.organizationId, actor: input.actor,
          body: resolutionNote, meta: { visibleToTenant: true, resolution: true },
        });
      }
      void notifyComplaintResolved(input.complaint.id, resolutionNote);
    }
  }

  if (input.actor.userId) {
    await logAudit({
      userId: input.actor.userId, userEmail: input.actor.email, action: "UPDATE",
      resource: "TenantComplaint", resourceId: input.complaint.id, organizationId: input.complaint.organizationId,
      before: { stageIndex: ct.currentStageIndex }, after: { action: input.action, stageIndex: decision.toIndex },
    });
  }
  return { ok: true };
}

// ─── Request-bound loader ────────────────────────────────────────────────────

/**
 * Load + gate a complaint for the session. A row the role may not see
 * (STAFF_CONDUCT for CARETAKER) returns 404, not 403 — it must look
 * nonexistent rather than confirm it exists.
 */
export async function loadComplaintForSession(
  id: string,
  session: Session,
): Promise<{ complaint: ComplaintRow; error: null } | { complaint: null; error: Response }> {
  const complaint = await prisma.tenantComplaint.findUnique({ where: { id }, include: COMPLAINT_INCLUDE });
  if (!complaint || !complaintVisibleTo(session.user.orgRole, complaint.category)) {
    return { complaint: null, error: Response.json({ error: "Not found" }, { status: 404 }) };
  }
  const access = await requirePropertyAccess(complaint.propertyId);
  if (!access.ok) return { complaint: null, error: access.error! };
  return { complaint, error: null };
}


