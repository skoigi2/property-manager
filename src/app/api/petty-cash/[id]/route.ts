import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { pettyCashSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = pettyCashSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { date, propertyId, ...rest } = parsed.data;

  if (propertyId && !propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const before = await prisma.pettyCash.findUnique({ where: { id: params.id }, select: { type: true, amount: true, date: true, propertyId: true } });
  const updated = await prisma.pettyCash.update({
    where: { id: params.id },
    data: { ...rest, date: new Date(date), propertyId: propertyId ?? null },
  });

  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "PettyCash", resourceId: params.id, before, after: { type: updated.type, amount: updated.amount, date: updated.date } });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const before = await prisma.pettyCash.findUnique({ where: { id: params.id }, select: { type: true, amount: true, date: true } });
  await prisma.pettyCash.delete({ where: { id: params.id } });
  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "DELETE", resource: "PettyCash", resourceId: params.id, before });
  return Response.json({ success: true });
}
