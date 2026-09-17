import { requireRolesWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * DELETE /api/utilities/tariffs/[id] — ADMIN / MANAGER. Safe for history:
 * approved readings carry their own rate snapshot, so removing a tariff only
 * changes what future approvals resolve to.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireRolesWrite(["ADMIN", "MANAGER"]);
  if (error) return error;

  const tariff = await prisma.utilityTariff.findUnique({
    where: { id: params.id },
    include: { property: { select: { organizationId: true } } },
  });
  if (!tariff) return Response.json({ error: "Tariff not found" }, { status: 404 });
  const access = await requirePropertyAccess(tariff.propertyId);
  if (!access.ok) return access.error!;

  await prisma.utilityTariff.delete({ where: { id: tariff.id } });
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "UtilityTariff",
    resourceId: tariff.id,
    organizationId: tariff.property.organizationId ?? session!.user.organizationId,
    before: { utility: tariff.utility, effectiveFrom: tariff.effectiveFrom, supplyRate: tariff.supplyRate, fuelRate: tariff.fuelRate },
  });
  return new Response(null, { status: 204 });
}
