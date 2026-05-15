import { requireAuth, requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { updateCaseSchema } from "@/lib/validations";
import { getCaseAttachmentSignedUrl } from "@/lib/supabase-storage";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { id: true, name: true, currency: true } },
      unit:     { select: { id: true, unitNumber: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      events: { orderBy: { createdAt: "asc" } },
      maintenanceJobs: {
        select: {
          id: true,
          description: true,
          vendor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  // Look up tenant via unit (if a unit is attached and has an active tenant)
  let tenantContext: { id: string; name: string; email: string | null; monthlyRent: number; serviceCharge: number; leaseEnd: string | null; proposedRent: number | null; proposedLeaseEnd: string | null } | null = null;
  if (thread.unitId) {
    const tenant = await prisma.tenant.findFirst({
      where: { unitId: thread.unitId, isActive: true },
      select: {
        id: true, name: true, email: true, monthlyRent: true, serviceCharge: true,
        leaseEnd: true, proposedRent: true, proposedLeaseEnd: true,
      },
    });
    if (tenant) {
      tenantContext = {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        monthlyRent: tenant.monthlyRent,
        serviceCharge: tenant.serviceCharge,
        leaseEnd: tenant.leaseEnd?.toISOString() ?? null,
        proposedRent: tenant.proposedRent,
        proposedLeaseEnd: tenant.proposedLeaseEnd?.toISOString() ?? null,
      };
    }
  }
  const vendorContext = thread.maintenanceJobs[0]?.vendor ?? null;

  // Resolve signed URLs for attachments (best effort)
  const events = await Promise.all(
    thread.events.map(async (e) => {
      if (!e.attachmentUrls || e.attachmentUrls.length === 0) return { ...e, attachmentLinks: [] };
      const links = await Promise.all(
        e.attachmentUrls.map(async (p) => {
          try {
            const url = await getCaseAttachmentSignedUrl(p);
            return { path: p, url };
          } catch {
            return { path: p, url: null };
          }
        })
      );
      return { ...e, attachmentLinks: links };
    })
  );

  return Response.json({ ...thread, events, tenantContext, vendorContext });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({ where: { id: params.id } });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = updateCaseSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const before = thread;
  const data = parsed.data;
  const now = new Date();

  const eventCreates: Parameters<typeof prisma.caseEvent.create>[0]["data"][] = [];
  const actor = {
    actorUserId: session!.user.id,
    actorEmail: session!.user.email ?? null,
    actorName: session!.user.name ?? null,
  };

  if (data.status !== undefined && data.status !== thread.status) {
    eventCreates.push({
      caseThreadId: thread.id,
      kind: "STATUS_CHANGE",
      ...actor,
      body: `Status changed from ${thread.status} to ${data.status}`,
      meta: { from: thread.status, to: data.status },
    });
  }
  if (data.stage !== undefined && data.stage !== thread.stage) {
    eventCreates.push({
      caseThreadId: thread.id,
      kind: "STAGE_CHANGE",
      ...actor,
      body: data.stage ? `Stage set to "${data.stage}"` : "Stage cleared",
      meta: { from: thread.stage, to: data.stage },
    });
  }
  if (data.assignedToUserId !== undefined && data.assignedToUserId !== thread.assignedToUserId) {
    eventCreates.push({
      caseThreadId: thread.id,
      kind: "ASSIGNMENT",
      ...actor,
      body: data.assignedToUserId ? `Assigned to user ${data.assignedToUserId}` : "Unassigned",
      meta: { from: thread.assignedToUserId, to: data.assignedToUserId },
    });
  }
  if (data.waitingOn !== undefined && data.waitingOn !== thread.waitingOn) {
    eventCreates.push({
      caseThreadId: thread.id,
      kind: "EXTERNAL_UPDATE",
      ...actor,
      body: `Waiting on: ${data.waitingOn}`,
      meta: { from: thread.waitingOn, to: data.waitingOn },
    });
  }

  const stageChanged = data.stage !== undefined && data.stage !== thread.stage;

  const [updated] = await prisma.$transaction([
    prisma.caseThread.update({
      where: { id: thread.id },
      data: {
        ...data,
        lastActivityAt: now,
        ...(stageChanged ? { stageStartedAt: now } : {}),
      },
    }),
    ...eventCreates.map((d) => prisma.caseEvent.create({ data: d })),
  ]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "CaseThread",
    resourceId: thread.id,
    organizationId: thread.organizationId,
    before,
    after: updated,
  });

  return Response.json(updated);
}
