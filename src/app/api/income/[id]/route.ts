import { requireManager, requirePropertyAccess, requireManagerWrite, requirePermissionWrite} from "@/lib/auth-utils";
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

// PATCH — mark commission paid / unpaid, OR link the entry to a tenant
// (used by the Deposit tab to attach an untagged unit DEPOSIT receipt to the
// tenant so it counts toward the deposit-held calculation).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyId = await loadEntryPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = z
    .object({
      commissionPaidAt: z.string().nullable().optional(),
      tenantId: z.string().min(1).optional(),
    })
    .safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.commissionPaidAt === undefined && parsed.data.tenantId === undefined) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const before = await prisma.incomeEntry.findUnique({
    where: { id: params.id },
    select: { commissionPaidAt: true, agentCommission: true, agentName: true, tenantId: true, unitId: true },
  });

  // Tenant link: only to a tenant on the SAME unit — an untagged deposit must
  // never be attributed across units.
  if (parsed.data.tenantId !== undefined) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: parsed.data.tenantId },
      select: { unitId: true },
    });
    if (!tenant || tenant.unitId !== before?.unitId) {
      return Response.json({ error: "Tenant not found on this entry's unit" }, { status: 400 });
    }
  }

  const entry = await prisma.incomeEntry.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.commissionPaidAt !== undefined
        ? { commissionPaidAt: parsed.data.commissionPaidAt ? new Date(parsed.data.commissionPaidAt) : null }
        : {}),
      ...(parsed.data.tenantId !== undefined ? { tenantId: parsed.data.tenantId } : {}),
    },
  });

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email,
    action:    "UPDATE",
    resource:  "IncomeEntry",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before: { commissionPaidAt: before?.commissionPaidAt ?? null, tenantId: before?.tenantId ?? null },
    after:  { commissionPaidAt: entry.commissionPaidAt, tenantId: entry.tenantId },
  });

  return Response.json(entry);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
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
  const { session, error } = await requirePermissionWrite("FINANCIAL_DELETE");
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
