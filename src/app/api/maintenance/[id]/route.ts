import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  title:         z.string().min(1).optional(),
  description:   z.string().optional(),
  category:      z.enum(["PLUMBING","ELECTRICAL","STRUCTURAL","APPLIANCE","PAINTING","CLEANING","SECURITY","PEST_CONTROL","OTHER"]).optional(),
  priority:      z.enum(["LOW","MEDIUM","HIGH","URGENT"]).optional(),
  status:        z.enum(["OPEN","IN_PROGRESS","AWAITING_PARTS","DONE","CANCELLED"]).optional(),
  unitId:        z.string().nullable().optional(),
  reportedBy:    z.string().optional(),
  assignedTo:    z.string().optional(),
  scheduledDate: z.string().nullable().optional(),
  completedDate: z.string().nullable().optional(),
  cost:          z.coerce.number().min(0).nullable().optional(),
  notes:         z.string().optional(),
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
      },
    });

    return Response.json({ job: linked, expense });
  }

  // ── Standard update ───────────────────────────────────────────────────────
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { scheduledDate, completedDate, ...rest } = parsed.data;

  // Auto-set completedDate when marking DONE
  const autoCompletedDate =
    rest.status === "DONE" && !job!.completedDate
      ? new Date()
      : completedDate !== undefined
      ? completedDate ? new Date(completedDate) : null
      : undefined;

  const updated = await prisma.maintenanceJob.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(scheduledDate !== undefined ? { scheduledDate: scheduledDate ? new Date(scheduledDate) : null } : {}),
      ...(autoCompletedDate !== undefined ? { completedDate: autoCompletedDate } : {}),
    },
    include: {
      property: { select: { id: true, name: true } },
      unit:     { select: { id: true, unitNumber: true } },
    },
  });

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
