import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { MaintenanceFrequency } from "@prisma/client";

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

function toRecurringFrequency(f: string): string | null {
  switch (f) {
    case "MONTHLY": return "MONTHLY";
    case "QUARTERLY": return "QUARTERLY";
    case "BIANNUALLY": return "BIANNUAL";
    case "ANNUALLY": return "ANNUAL";
    default: return null;
  }
}

function calcNextDueFromToday(frequency: string): Date {
  const d = new Date();
  switch (frequency) {
    case "MONTHLY": d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "BIANNUALLY": d.setMonth(d.getMonth() + 6); break;
    case "ANNUALLY": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (ids === null) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  const effectiveIds = propertyId && ids.includes(propertyId) ? [propertyId] : ids;
  const assetWhere = {
    propertyId: { in: effectiveIds },
  };

  // Fetch all active maintenance schedules across accessible assets and properties
  const schedules = await prisma.assetMaintenanceSchedule.findMany({
    where: {
      isActive: true,
      OR: [
        { asset: assetWhere },
        { propertyId: { in: effectiveIds }, assetId: null },
      ],
    },
    include: {
      asset: {
        select: {
          id: true,
          name: true,
          category: true,
          categoryOther: true,
          property: { select: { id: true, name: true } },
          unit: { select: { unitNumber: true } },
        },
      },
      property: {
        select: { id: true, name: true },
      },
    },
    orderBy: [
      { nextDue: "asc" },
    ],
  });

  // YTD maintenance cost
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytdAgg = await prisma.assetMaintenanceLog.aggregate({
    where: {
      date: { gte: yearStart },
      asset: assetWhere,
    },
    _sum: { cost: true },
  });

  return Response.json({
    schedules,
    ytdCost: ytdAgg._sum.cost ?? 0,
  });
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { taskName, description, frequency, lastDone, estimatedCost, propertyId, assetId, taskCategory } = body as {
    taskName?: string;
    description?: string;
    frequency?: string;
    lastDone?: string;
    estimatedCost?: number;
    propertyId?: string;
    assetId?: string | null;
    taskCategory?: string;
  };

  if (!propertyId) {
    return Response.json({ error: "propertyId is required" }, { status: 400 });
  }
  if (!propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!taskName || typeof taskName !== "string" || !taskName.trim()) {
    return Response.json({ error: "taskName is required" }, { status: 400 });
  }
  if (!frequency || !Object.values(MaintenanceFrequency).includes(frequency as MaintenanceFrequency)) {
    return Response.json({ error: "Valid frequency is required" }, { status: 400 });
  }
  if (!assetId && !taskCategory) {
    return Response.json({ error: "taskCategory is required for property-wide tasks" }, { status: 400 });
  }

  // If assetId provided, verify it belongs to this property
  let assetUnitId: string | null = null;
  let assetName: string | null = null;
  if (assetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { propertyId: true, unitId: true, name: true },
    });
    if (!asset || asset.propertyId !== propertyId) {
      return Response.json({ error: "Asset not found or does not belong to this property" }, { status: 400 });
    }
    assetUnitId = asset.unitId ?? null;
    assetName = asset.name;
  }

  const lastDoneDate = lastDone ? new Date(lastDone) : null;
  const nextDueDate = lastDoneDate ? calcNextDue(lastDoneDate, frequency) : null;

  try {
    const schedule = await prisma.assetMaintenanceSchedule.create({
      data: {
        assetId: assetId ?? null,
        propertyId,
        taskName: taskName.trim(),
        description: description || null,
        frequency: frequency as MaintenanceFrequency,
        lastDone: lastDoneDate,
        nextDue: nextDueDate,
        taskCategory: assetId ? null : (taskCategory ?? null),
        estimatedCost: estimatedCost ?? null,
      },
    });

    const recurringFreq = toRecurringFrequency(frequency);
    if (estimatedCost && estimatedCost > 0 && recurringFreq !== null) {
      const nextDue = nextDueDate ?? calcNextDueFromToday(frequency);
      const descriptionLabel = assetId && assetName
        ? `${assetName} — ${taskName.trim()}`
        : `${taskCategory ?? "Maintenance"} — ${taskName.trim()}`;

      const [recurringExpense] = await prisma.$transaction([
        prisma.recurringExpense.create({
          data: {
            description: descriptionLabel,
            amount: estimatedCost,
            category: "MAINTENANCE",
            scope: assetUnitId ? "UNIT" : "PROPERTY",
            propertyId,
            unitId: assetUnitId ?? null,
            frequency: recurringFreq as any,
            nextDueDate: nextDue,
            isActive: true,
          },
        }),
      ]);

      await prisma.assetMaintenanceSchedule.update({
        where: { id: schedule.id },
        data: { recurringExpenseId: recurringExpense.id },
      });

      return Response.json(
        { ...schedule, recurringExpenseId: recurringExpense.id, estimatedCost },
        { status: 201 }
      );
    }

    return Response.json(schedule, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
