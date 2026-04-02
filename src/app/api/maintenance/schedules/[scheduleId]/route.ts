import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
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

export async function PATCH(
  req: Request,
  { params }: { params: { scheduleId: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.assetMaintenanceSchedule.findUnique({
    where: { id: params.scheduleId },
    select: {
      propertyId: true,
      assetId: true,
      recurringExpenseId: true,
      estimatedCost: true,
      isActive: true,
      frequency: true,
      lastDone: true,
      taskName: true,
      taskCategory: true,
    },
  });
  if (!existing) return Response.json({ error: "Schedule not found" }, { status: 404 });

  const schedulePropertyId = existing.propertyId;
  if (!schedulePropertyId || !propertyIds.includes(schedulePropertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { taskName, description, frequency, lastDone, isActive, estimatedCost } = body as {
    taskName?: string;
    description?: string;
    frequency?: string;
    lastDone?: string | null;
    isActive?: boolean;
    estimatedCost?: number | null;
  };

  const effectiveFrequency = (frequency as MaintenanceFrequency | undefined) ?? existing.frequency;
  const effectiveLastDone =
    lastDone !== undefined
      ? lastDone
        ? new Date(lastDone)
        : null
      : existing.lastDone;

  const nextDue = effectiveLastDone ? calcNextDue(effectiveLastDone, effectiveFrequency) : null;

  try {
    const updated = await prisma.assetMaintenanceSchedule.update({
      where: { id: params.scheduleId },
      data: {
        ...(taskName !== undefined && { taskName }),
        ...(description !== undefined && { description: description || null }),
        ...(frequency !== undefined && { frequency: frequency as MaintenanceFrequency }),
        ...(lastDone !== undefined && { lastDone: lastDone ? new Date(lastDone) : null }),
        ...(isActive !== undefined && { isActive }),
        ...(estimatedCost !== undefined && { estimatedCost: estimatedCost ?? null }),
        nextDue,
      },
    });

    // Sync recurring expense
    const effectiveEstimatedCost = estimatedCost !== undefined ? estimatedCost : existing.estimatedCost;
    const effectiveIsActive = isActive !== undefined ? isActive : existing.isActive;
    const recurringFreq = toRecurringFrequency(String(effectiveFrequency));
    const taskLabel = taskName ?? existing.taskName;
    const categoryLabel = existing.taskCategory ?? "Maintenance";

    if (effectiveEstimatedCost && effectiveEstimatedCost > 0 && recurringFreq !== null && !existing.recurringExpenseId) {
      const nextDueDate = nextDue ?? calcNextDueFromToday(String(effectiveFrequency));
      const [recurringExpense] = await prisma.$transaction([
        prisma.recurringExpense.create({
          data: {
            description: `${categoryLabel} — ${taskLabel}`,
            amount: effectiveEstimatedCost,
            category: "MAINTENANCE",
            scope: "PROPERTY",
            propertyId: schedulePropertyId,
            frequency: recurringFreq as any,
            nextDueDate,
            isActive: effectiveIsActive,
          },
        }),
      ]);
      await prisma.assetMaintenanceSchedule.update({
        where: { id: params.scheduleId },
        data: { recurringExpenseId: recurringExpense.id },
      });
      return Response.json({ ...updated, recurringExpenseId: recurringExpense.id });
    } else if (effectiveEstimatedCost && effectiveEstimatedCost > 0 && existing.recurringExpenseId) {
      await prisma.$transaction([
        prisma.recurringExpense.update({
          where: { id: existing.recurringExpenseId },
          data: {
            amount: effectiveEstimatedCost,
            isActive: effectiveIsActive,
            ...(recurringFreq !== null && { frequency: recurringFreq as any }),
          },
        }),
      ]);
    } else if ((!effectiveEstimatedCost || effectiveEstimatedCost <= 0) && existing.recurringExpenseId) {
      await prisma.$transaction([
        prisma.recurringExpense.delete({ where: { id: existing.recurringExpenseId } }),
        prisma.assetMaintenanceSchedule.update({
          where: { id: params.scheduleId },
          data: { recurringExpenseId: null },
        }),
      ]);
      return Response.json({ ...updated, recurringExpenseId: null });
    } else if (isActive !== undefined && existing.recurringExpenseId) {
      await prisma.$transaction([
        prisma.recurringExpense.update({
          where: { id: existing.recurringExpenseId },
          data: { isActive: effectiveIsActive },
        }),
      ]);
    }

    return Response.json(updated);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { scheduleId: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.assetMaintenanceSchedule.findUnique({
    where: { id: params.scheduleId },
    select: { propertyId: true, recurringExpenseId: true },
  });
  if (!existing) return Response.json({ error: "Schedule not found" }, { status: 404 });

  if (!existing.propertyId || !propertyIds.includes(existing.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (existing.recurringExpenseId) {
      await prisma.$transaction([
        prisma.recurringExpense.delete({ where: { id: existing.recurringExpenseId } }),
        prisma.assetMaintenanceSchedule.delete({ where: { id: params.scheduleId } }),
      ]);
    } else {
      await prisma.assetMaintenanceSchedule.delete({ where: { id: params.scheduleId } });
    }
    return new Response(null, { status: 204 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
