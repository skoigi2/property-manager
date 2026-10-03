import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { cancelScheduledIncrease, RentIncreaseError } from "@/lib/rent-increase";

// Cancel a scheduled (not yet applied) rent increase.
export async function DELETE(
  _req: Request,
  props: { params: Promise<{ id: string; historyId: string }> }
) {
  const params = await props.params;
  const { error, session } = await requireManagerWrite();
  if (error) return error;
  const t = await prisma.tenant.findUnique({ where: { id: params.id }, select: { unit: { select: { propertyId: true } } } });
  if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(t.unit.propertyId);
  if (!access.ok) return access.error!;
  try {
    await cancelScheduledIncrease(params.id, params.historyId, {
      userId: session!.user.id,
      email: session!.user.email,
      name: session!.user.name,
      organizationId: session!.user.organizationId,
    });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof RentIncreaseError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
