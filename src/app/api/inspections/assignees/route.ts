import { requireOpsStaff, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { listAssignees } from "@/lib/inspections";

// GET ?propertyId= — the people an inspection on this property may be assigned to.
export async function GET(req: Request) {
  const { error } = await requireOpsStaff();
  if (error) return error;
  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId) return Response.json({ error: "propertyId required" }, { status: 400 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { organizationId: true } });
  if (!property?.organizationId) return Response.json([]);
  return Response.json(await listAssignees(propertyId, property.organizationId));
}
