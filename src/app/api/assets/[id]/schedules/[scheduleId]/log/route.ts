import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function calcNextDue(lastDone: Date, frequency: string): Date {
  const d = new Date(lastDone);
  switch (frequency) {
    case "WEEKLY": d.setDate(d.getDate() + 7); break;
    case "MONTHLY": d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "BIANNUALLY": d.setMonth(d.getMonth() + 6); break;
    case "ANNUALLY": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string; scheduleId: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true, unitId: true, name: true },
  });
  if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.assetMaintenanceSchedule.findUnique({
    where: { id: params.scheduleId },
    select: { assetId: true, taskName: true },
  });
  if (!existing || existing.assetId !== params.id) {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { date, description, cost, technician, notes } = body as {
    date?: string;
    description?: string;
    cost?: number;
    technician?: string;
    notes?: string;
  };

  if (!date || !description) {
    return Response.json({ error: "date and description are required" }, { status: 400 });
  }

  try {
    const [log] = await prisma.$transaction(async (tx) => {
      // Auto-create an ExpenseEntry when a cost is provided
      let expenseId: string | null = null;
      if (cost && cost > 0) {
        const hasUnit = !!asset.unitId;
        const expenseDesc = `${asset.name} — ${existing.taskName}: ${description}`;
        const expense = await tx.expenseEntry.create({
          data: {
            date: new Date(date),
            amount: cost,
            category: "MAINTENANCE",
            scope: hasUnit ? "UNIT" : "PROPERTY",
            propertyId: asset.propertyId,
            ...(hasUnit ? { unitId: asset.unitId! } : {}),
            description: expenseDesc,
          },
        });
        expenseId = expense.id;
      }

      const createdLog = await tx.assetMaintenanceLog.create({
        data: {
          assetId: params.id,
          scheduleId: params.scheduleId,
          expenseId,
          date: new Date(date),
          description,
          cost: cost ?? null,
          technician: technician ?? null,
          notes: notes ?? null,
        },
      });

      const schedule = await tx.assetMaintenanceSchedule.findUnique({
        where: { id: params.scheduleId },
        select: { frequency: true },
      });

      if (schedule) {
        await tx.assetMaintenanceSchedule.update({
          where: { id: params.scheduleId },
          data: {
            lastDone: new Date(date),
            nextDue: calcNextDue(new Date(date), schedule.frequency),
          },
        });
      }

      return [createdLog];
    });

    return Response.json(log, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
