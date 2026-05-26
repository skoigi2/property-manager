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

  const { date, description, cost, technician, vendorId, notes } = body as {
    date?: string;
    description?: string;
    cost?: number;
    technician?: string;
    vendorId?: string | null;
    notes?: string;
  };

  if (!date || !description) {
    return Response.json({ error: "date and description are required" }, { status: 400 });
  }

  try {
    // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
    // Pre-read the schedule frequency so we can compute nextDue without nesting
    // a read inside the transaction. Frequency doesn't change here so this is safe.
    const schedule = await prisma.assetMaintenanceSchedule.findUnique({
      where: { id: params.scheduleId },
      select: { frequency: true },
    });

    const hasUnit = !!asset.unitId;
    const logData = {
      assetId: params.id,
      scheduleId: params.scheduleId,
      date: new Date(date),
      description,
      cost: cost ?? null,
      technician: technician ?? null,
      vendorId: vendorId ?? null,
      notes: notes ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops: any[] = [];
    if (cost && cost > 0) {
      // Nested write: create the expense and its linked maintenance log atomically.
      // Returns the expense — drill in for the created log via include.
      ops.push(prisma.expenseEntry.create({
        data: {
          date: new Date(date),
          amount: cost,
          category: "MAINTENANCE",
          scope: hasUnit ? "UNIT" : "PROPERTY",
          propertyId: asset.propertyId,
          ...(hasUnit ? { unitId: asset.unitId! } : {}),
          description: `${asset.name} — ${existing.taskName}: ${description}`,
          maintenanceLogs: { create: [logData] },
        },
        include: { maintenanceLogs: true },
      }));
    } else {
      // No cost → create the log alone, no linked expense.
      ops.push(prisma.assetMaintenanceLog.create({ data: { ...logData, expenseId: null } }));
    }

    if (schedule) {
      ops.push(prisma.assetMaintenanceSchedule.update({
        where: { id: params.scheduleId },
        data: {
          lastDone: new Date(date),
          nextDue: calcNextDue(new Date(date), schedule.frequency),
        },
      }));
    }

    const txResults = await prisma.$transaction(ops);
    // When the expense path ran, the log is nested under maintenanceLogs[0].
    const log = (cost && cost > 0)
      ? (txResults[0] as { maintenanceLogs: unknown[] }).maintenanceLogs[0]
      : txResults[0];

    return Response.json(log, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
