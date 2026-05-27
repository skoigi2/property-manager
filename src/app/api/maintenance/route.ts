import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { mapMaintenanceStatusToCase, mapMaintenanceWaitingOn } from "@/lib/cases";
import { computeDefaultStageSlaHours, getWorkflow, tryAutoAdvance } from "@/lib/case-workflows";

const createSchema = z.object({
  propertyId:  z.string().min(1),
  unitId:      z.string().optional(),
  title:       z.string().min(1, "Title required"),
  description: z.string().optional(),
  category:    z.enum(["PLUMBING","ELECTRICAL","STRUCTURAL","APPLIANCE","PAINTING","CLEANING","SECURITY","PEST_CONTROL","OTHER"]).default("OTHER"),
  priority:    z.enum(["LOW","MEDIUM","HIGH","URGENT"]).default("MEDIUM"),
  reportedBy:  z.string().optional(),
  assignedTo:  z.string().optional(),
  vendorId:    z.string().optional().nullable(),
  reportedDate:  z.string().optional(),
  scheduledDate: z.string().optional(),
  cost:          z.coerce.number().min(0).optional(),
  notes:         z.string().optional(),
  isEmergency:   z.boolean().default(false),
});

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const propertyId = searchParams.get("propertyId");
  const category = searchParams.get("category");
  const portalOnly = searchParams.get("portalOnly") === "true";

  const effectivePropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const jobs = await prisma.maintenanceJob.findMany({
    where: {
      propertyId: { in: effectivePropertyIds },
      ...(status ? { status: status as never } : {}),
      ...(category ? { category: category as never } : {}),
      ...(portalOnly ? { submittedViaPortal: true } : {}),
    },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true, phone: true } },
    },
    orderBy: [
      { status: "asc" },
      { priority: "desc" },
      { reportedDate: "desc" },
    ],
  });

  return Response.json(jobs);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { reportedDate, scheduledDate, ...rest } = parsed.data;

  const job = await prisma.maintenanceJob.create({
    data: {
      ...rest,
      reportedDate: reportedDate ? new Date(reportedDate) : new Date(),
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
    },
    include: {
      property: { select: { id: true, name: true, organizationId: true } },
      unit: { select: { id: true, unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true, phone: true } },
    },
  });

  // Auto-create CaseThread for this maintenance job. Two-step (vs single
  // transaction) because we need the job's id to set subjectId — acceptable
  // since case creation failure is non-fatal and recoverable via backfill.
  if (job.property.organizationId) {
    try {
      const now = new Date();
      // Workflow defaults + per-stage SLA override from the management agreement
      const wf = getWorkflow("MAINTENANCE");
      const agreement = await prisma.managementAgreement.findUnique({
        where: { propertyId: job.propertyId },
        select: { kpiEmergencyResponseHrs: true, kpiStandardResponseHrs: true },
      });
      const stageSlaHours = computeDefaultStageSlaHours(wf, {
        isEmergency: job.isEmergency,
        agreement,
      });

      const [thread] = await prisma.$transaction([
        prisma.caseThread.create({
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
        }),
      ]);
      await prisma.$transaction([
        prisma.maintenanceJob.update({
          where: { id: job.id },
          data: { caseThreadId: thread.id },
        }),
        prisma.caseEvent.create({
          data: {
            caseThreadId: thread.id,
            kind: "COMMENT",
            actorUserId: session!.user.id,
            actorEmail: session!.user.email ?? null,
            actorName: session!.user.name ?? null,
            body: job.description ?? `Maintenance job created: ${job.title}`,
          },
        }),
      ]);
      // If the job was created with a vendor already assigned, jump past Triaged.
      if (job.vendorId) {
        await tryAutoAdvance(thread.id, { kind: "VENDOR_ASSIGNED" });
      }
    } catch {
      // Case creation is best-effort — backfill script will reconcile.
    }
  }

  return Response.json(job, { status: 201 });
}
