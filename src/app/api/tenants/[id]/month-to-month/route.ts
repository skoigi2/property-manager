import { z } from "zod";
import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * PATCH { monthToMonth } — the lease has ended and the tenant stays on a
 * rolling month-to-month basis (or no longer does). Setting it clears the
 * "lease expired" Inbox item and shows the lease as Month-to-month; it is
 * reset automatically when the lease end date changes (renewal or edit).
 */
const schema = z.object({ monthToMonth: z.boolean() });

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error, session } = await requireManagerWrite();
  if (error) return error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "monthToMonth (true / false) is required." }, { status: 400 });
  const { monthToMonth } = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, isActive: true, leaseEnd: true, monthToMonth: true, unit: { select: { propertyId: true } } },
  });
  if (!tenant) return Response.json({ error: "Tenant not found." }, { status: 404 });
  const access = await requirePropertyAccess(tenant.unit.propertyId);
  if (!access.ok) return access.error!;

  if (monthToMonth) {
    if (!tenant.isActive) return Response.json({ error: "This tenant has moved out." }, { status: 400 });
    if (!tenant.leaseEnd || tenant.leaseEnd.getTime() >= Date.now()) {
      return Response.json(
        { error: "The lease hasn't ended yet — month-to-month applies once it has." },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { monthToMonth },
    select: { id: true, monthToMonth: true, leaseEnd: true },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Tenant",
    resourceId: tenant.id,
    organizationId: session!.user.organizationId,
    before: { monthToMonth: tenant.monthToMonth },
    after: { monthToMonth },
  });

  return Response.json(updated);
}
