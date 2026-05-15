import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { mapMaintenanceStatusToCase, mapMaintenanceWaitingOn } from "@/lib/cases";
import { auth } from "@/lib/auth";
import { clearHints } from "@/lib/hints";

const updateSchema = z.object({
  title:            z.string().min(1).optional(),
  description:      z.string().optional(),
  category:         z.enum(["PLUMBING","ELECTRICAL","STRUCTURAL","APPLIANCE","PAINTING","CLEANING","SECURITY","PEST_CONTROL","OTHER"]).optional(),
  priority:         z.enum(["LOW","MEDIUM","HIGH","URGENT"]).optional(),
  status:           z.enum(["OPEN","IN_PROGRESS","AWAITING_PARTS","DONE","CANCELLED"]).optional(),
  unitId:           z.string().nullable().optional(),
  reportedBy:       z.string().optional(),
  assignedTo:       z.string().optional(),
  vendorId:         z.string().nullable().optional(),
  scheduledDate:    z.string().nullable().optional(),
  completedDate:    z.string().nullable().optional(),
  cost:             z.coerce.number().min(0).nullable().optional(),
  notes:            z.string().optional(),
  isEmergency:      z.boolean().optional(),
  acknowledgedAt:   z.string().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  approvedAt:       z.string().nullable().optional(),
  approvalNotes:    z.string().optional(),
});

// Schema for the "log as expense" action
const logExpenseSchema = z.object({
  action:      z.literal("log_expense"),
  amount:      z.number().min(0),
  description: z.string().min(1),
  date:        z.string().min(1),
  category:    z.enum([
    "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY",
    "CLEANER","CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER",
  ]),
  isSunkCost: z.boolean().default(false),
});

async function getJobWithAccess(id: string) {
  const job = await prisma.maintenanceJob.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, name: true } },
      unit:     { select: { id: true, unitNumber: true } },
      vendor:   { select: { id: true, name: true, category: true, phone: true } },
    },
  });
  if (!job) return { job: null, accessError: Response.json({ error: "Not found" }, { status: 404 }) };
  const access = await requirePropertyAccess(job.propertyId);
  if (!access.ok) return { job: null, accessError: access.error! };
  return { job, accessError: null };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { job, accessError } = await getJobWithAccess(params.id);
  if (accessError) return accessError;

  const body = await req.json();

  // ── Log-as-expense action ─────────────────────────────────────────────────
  if (body.action === "log_expense") {
    const parsed = logExpenseSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

    if (job!.expenseId) {
      return Response.json({ error: "Expense already logged for this job" }, { status: 409 });
    }

    const { amount, description, date, category, isSunkCost } = parsed.data;

    // Determine scope + ids from the job
    const hasUnit = !!job!.unitId;
    const scope   = hasUnit ? "UNIT" : "PROPERTY";

    const [expense, updatedJob] = await prisma.$transaction([
      // 1. Create the expense entry
      prisma.expenseEntry.create({
        data: {
          date:        new Date(date),
          amount,
          description,
          category,
          scope,
          isSunkCost,
          ...(hasUnit
            ? { unitId: job!.unitId!, propertyId: job!.propertyId }
            : { propertyId: job!.propertyId }),
        },
      }),
      // 2. Link the expense back to the job (we'll patch expenseId after we have it)
      // Placeholder — we update below once we have the expense ID
      prisma.maintenanceJob.findUnique({ where: { id: params.id } }),
    ]);

    // Now update the job with the real expenseId
    const linked = await prisma.maintenanceJob.update({
      where: { id: params.id },
      data:  { expenseId: expense.id },
      include: {
        property: { select: { id: true, name: true } },
        unit:     { select: { id: true, unitNumber: true } },
        vendor:   { select: { id: true, name: true, category: true, phone: true } },
      },
    });

    return Response.json({ job: linked, expense });
  }

  // ── Standard update ───────────────────────────────────────────────────────
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { scheduledDate, completedDate, acknowledgedAt, approvedAt, ...rest } = parsed.data;

  // Auto-set completedDate when marking DONE
  const autoCompletedDate =
    rest.status === "DONE" && !job!.completedDate
      ? new Date()
      : completedDate !== undefined
      ? completedDate ? new Date(completedDate) : null
      : undefined;

  // Auto-set acknowledgedAt if not already set and now being acknowledged
  const autoAcknowledgedAt =
    acknowledgedAt !== undefined
      ? acknowledgedAt ? new Date(acknowledgedAt) : null
      : rest.status === "IN_PROGRESS" && !job!.acknowledgedAt
      ? new Date()
      : undefined;

  const updated = await prisma.maintenanceJob.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(scheduledDate !== undefined ? { scheduledDate: scheduledDate ? new Date(scheduledDate) : null } : {}),
      ...(autoCompletedDate !== undefined ? { completedDate: autoCompletedDate } : {}),
      ...(autoAcknowledgedAt !== undefined ? { acknowledgedAt: autoAcknowledgedAt } : {}),
      ...(approvedAt !== undefined ? { approvedAt: approvedAt ? new Date(approvedAt) : null } : {}),
    },
    include: {
      property: { select: { id: true, name: true } },
      unit:     { select: { id: true, unitNumber: true } },
      vendor:   { select: { id: true, name: true, category: true, phone: true } },
    },
  });

  // Clear URGENT_OPEN_4H hint when status leaves OPEN
  if (rest.status && rest.status !== "OPEN") {
    await clearHints(params.id, "URGENT_OPEN_4H");
  }

  // Mirror status/vendor/priority changes onto the linked CaseThread
  if (job!.caseThreadId) {
    try {
      const session = await auth();
      const actor = {
        actorUserId: session?.user.id ?? null,
        actorEmail: session?.user.email ?? null,
        actorName: session?.user.name ?? null,
      };
      const events: Parameters<typeof prisma.caseEvent.create>[0]["data"][] = [];
      const statusChanged = rest.status !== undefined && rest.status !== job!.status;
      const vendorChanged = rest.vendorId !== undefined && rest.vendorId !== job!.vendorId;
      const priorityChanged = rest.priority !== undefined && rest.priority !== job!.priority;

      if (statusChanged) {
        events.push({
          caseThreadId: job!.caseThreadId,
          kind: "STATUS_CHANGE",
          ...actor,
          body: `Maintenance status: ${job!.status} → ${rest.status}`,
          meta: { from: job!.status, to: rest.status },
        });
      }
      if (vendorChanged) {
        events.push({
          caseThreadId: job!.caseThreadId,
          kind: "VENDOR_ASSIGNED",
          ...actor,
          body: rest.vendorId ? `Vendor assigned` : `Vendor removed`,
          meta: { from: job!.vendorId, to: rest.vendorId },
        });
      }
      if (priorityChanged) {
        events.push({
          caseThreadId: job!.caseThreadId,
          kind: "STAGE_CHANGE",
          ...actor,
          body: `Priority: ${job!.priority} → ${rest.priority}`,
          meta: { from: job!.priority, to: rest.priority },
        });
      }

      if (events.length > 0 || statusChanged) {
        const newStatus = mapMaintenanceStatusToCase(updated.status);
        const newWaitingOn = mapMaintenanceWaitingOn(updated);
        await prisma.$transaction([
          prisma.caseThread.update({
            where: { id: job!.caseThreadId },
            data: {
              status: newStatus,
              waitingOn: newWaitingOn,
              lastActivityAt: new Date(),
            },
          }),
          ...events.map((data) => prisma.caseEvent.create({ data })),
        ]);
      }
    } catch {
      // Mirroring is best-effort
    }
  }

  return Response.json(updated);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { accessError } = await getJobWithAccess(params.id);
  if (accessError) return accessError;

  await prisma.maintenanceJob.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
