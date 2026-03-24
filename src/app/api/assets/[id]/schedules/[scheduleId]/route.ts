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

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; scheduleId: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true },
  });
  if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.assetMaintenanceSchedule.findUnique({
    where: { id: params.scheduleId },
    select: { assetId: true, frequency: true, lastDone: true },
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

  const { taskName, description, frequency, lastDone, isActive } = body as {
    taskName?: string;
    description?: string;
    frequency?: string;
    lastDone?: string | null;
    isActive?: boolean;
  };

  // Recalculate nextDue if lastDone or frequency changes
  const effectiveFrequency = (frequency as MaintenanceFrequency | undefined) ?? existing.frequency;
  const effectiveLastDone =
    lastDone !== undefined
      ? lastDone
        ? new Date(lastDone)
        : null
      : existing.lastDone;

  const nextDue =
    effectiveLastDone ? calcNextDue(effectiveLastDone, effectiveFrequency) : null;

  try {
    const updated = await prisma.assetMaintenanceSchedule.update({
      where: { id: params.scheduleId },
      data: {
        ...(taskName !== undefined && { taskName }),
        ...(description !== undefined && { description: description || null }),
        ...(frequency !== undefined && { frequency: frequency as MaintenanceFrequency }),
        ...(lastDone !== undefined && { lastDone: lastDone ? new Date(lastDone) : null }),
        ...(isActive !== undefined && { isActive }),
        nextDue,
      },
    });

    return Response.json(updated);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; scheduleId: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true },
  });
  if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.assetMaintenanceSchedule.findUnique({
    where: { id: params.scheduleId },
    select: { assetId: true },
  });
  if (!existing || existing.assetId !== params.id) {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }

  try {
    await prisma.assetMaintenanceSchedule.delete({ where: { id: params.scheduleId } });
    return new Response(null, { status: 204 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
