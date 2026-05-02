import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { incomeEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

async function loadEntryPropertyId(id: string): Promise<string | null> {
  const e = await prisma.incomeEntry.findUnique({
    where: { id },
    select: { unit: { select: { propertyId: true } } },
  });
  return e?.unit?.propertyId ?? null;
}

// PATCH — mark commission paid / unpaid
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyId = await loadEntryPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = z.object({ commissionPaidAt: z.string().nullable() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const before = await prisma.incomeEntry.findUnique({
    where: { id: params.id },
    select: { commissionPaidAt: true, agentCommission: true, agentName: true },
  });

  const entry = await prisma.incomeEntry.update({
    where: { id: params.id },
    data: { commissionPaidAt: parsed.data.commissionPaidAt ? new Date(parsed.data.commissionPaidAt) : null },
  });

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email,
    action:    "UPDATE",
    resource:  "IncomeEntry",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before: { commissionPaidAt: before?.commissionPaidAt ?? null },
    after:  { commissionPaidAt: entry.commissionPaidAt },
  });

  return Response.json(entry);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyId = await loadEntryPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = incomeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, ...rest } = parsed.data;

  const before = await prisma.incomeEntry.findUnique({ where: { id: params.id }, select: { grossAmount: true, type: true, date: true } });

  const entry = await prisma.incomeEntry.update({
    where: { id: params.id },
    data: {
      ...rest,
      date: new Date(date),
      checkIn: checkIn ? new Date(checkIn) : null,
      checkOut: checkOut ? new Date(checkOut) : null,
    },
    include: { unit: { include: { property: { select: { name: true } } } } },
  });

  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "IncomeEntry", resourceId: params.id, organizationId: session!.user.organizationId, before, after: { type: entry.type, grossAmount: entry.grossAmount, date: entry.date } });

  return Response.json(entry);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyId = await loadEntryPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const before = await prisma.incomeEntry.findUnique({ where: { id: params.id }, select: { grossAmount: true, type: true, date: true } });
  await prisma.incomeEntry.delete({ where: { id: params.id } });
  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "DELETE", resource: "IncomeEntry", resourceId: params.id, organizationId: session!.user.organizationId, before });
  return Response.json({ success: true });
}
