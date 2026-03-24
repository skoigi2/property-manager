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

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const asset = await prisma.asset.findUnique({
      where: { id: params.id },
      select: { propertyId: true },
    });
    if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
    if (!propertyIds.includes(asset.propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const schedules = await prisma.assetMaintenanceSchedule.findMany({
      where: { assetId: params.id },
      include: { _count: { select: { logs: true } } },
      orderBy: { createdAt: "asc" },
    });

    return Response.json(schedules);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true },
  });
  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { taskName, description, frequency, lastDone } = body as {
    taskName?: string;
    description?: string;
    frequency?: string;
    lastDone?: string;
  };

  if (!taskName || typeof taskName !== "string" || !taskName.trim()) {
    return Response.json({ error: "taskName is required" }, { status: 400 });
  }
  if (!frequency || !Object.values(MaintenanceFrequency).includes(frequency as MaintenanceFrequency)) {
    return Response.json({ error: "Valid frequency is required" }, { status: 400 });
  }

  const lastDoneDate = lastDone ? new Date(lastDone) : null;
  const nextDueDate = lastDoneDate ? calcNextDue(lastDoneDate, frequency) : null;

  try {
    const schedule = await prisma.assetMaintenanceSchedule.create({
      data: {
        assetId: params.id,
        taskName: taskName.trim(),
        description: description || null,
        frequency: frequency as MaintenanceFrequency,
        lastDone: lastDoneDate,
        nextDue: nextDueDate,
      },
      include: { _count: { select: { logs: true } } },
    });

    return Response.json(schedule, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
