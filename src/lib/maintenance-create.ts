import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { mapMaintenanceStatusToCase, mapMaintenanceWaitingOn } from "@/lib/cases";
import { computeDefaultStageSlaHours, getWorkflow, tryAutoAdvance } from "@/lib/case-workflows";

// Creating a maintenance job: the job, its CaseThread (with the workflow's
// SLA, overridden by the management agreement), the opening timeline event and
// the maintenance.created webhook. Shared by POST /api/maintenance and repair
// jobs raised from inspection damage. Access checks are the caller's job.

export async function createMaintenanceJob(
  data: Prisma.MaintenanceJobUncheckedCreateInput,
  actor: { id: string | null; email: string | null; name: string | null },
) {
  const job = await prisma.maintenanceJob.create({
    data,
    include: {
      property: { select: { id: true, name: true, organizationId: true } },
      unit: { select: { id: true, unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true, phone: true } },
    },
  });

  // Two steps (not one transaction) because the case needs the job's id;
  // case creation is best-effort — the backfill script reconciles a miss.
  if (job.property.organizationId) {
    try {
      const now = new Date();
      const wf = getWorkflow("MAINTENANCE");
      const agreement = await prisma.managementAgreement.findUnique({
        where: { propertyId: job.propertyId },
        select: { kpiEmergencyResponseHrs: true, kpiStandardResponseHrs: true },
      });
      const stageSlaHours = computeDefaultStageSlaHours(wf, { isEmergency: job.isEmergency, agreement });
      const thread = await prisma.caseThread.create({
        data: {
          caseType: "MAINTENANCE",
          subjectId: job.id,
          propertyId: job.propertyId,
          unitId: job.unitId,
          organizationId: job.property.organizationId,
          title: job.title,
          status: mapMaintenanceStatusToCase(job.status),
          waitingOn: mapMaintenanceWaitingOn(job),
          stage: wf.stages[0].label,
          currentStageIndex: 0,
          workflowKey: wf.key,
          stageSlaHours,
          stageStartedAt: now,
          lastActivityAt: now,
        },
      });
      await prisma.$transaction([
        prisma.maintenanceJob.update({ where: { id: job.id }, data: { caseThreadId: thread.id } }),
        prisma.caseEvent.create({
          data: {
            caseThreadId: thread.id,
            kind: "COMMENT",
            actorUserId: actor.id,
            actorEmail: actor.email,
            actorName: actor.name,
            body: job.description ?? `Maintenance job created: ${job.title}`,
          },
        }),
      ]);
      // Created with a vendor already assigned: jump past Triaged.
      if (job.vendorId) await tryAutoAdvance(thread.id, { kind: "VENDOR_ASSIGNED" });
    } catch {
      // best-effort — see above
    }
  }

  void dispatchWebhookEvent(job.property.organizationId, "maintenance.created", {
    jobId: job.id,
    title: job.title,
    priority: job.priority,
    status: job.status,
    propertyId: job.property.id,
    propertyName: job.property.name,
    submittedViaPortal: job.submittedViaPortal ?? false,
  });

  return job;
}
