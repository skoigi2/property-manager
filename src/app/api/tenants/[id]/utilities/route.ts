import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tenantUtilitiesResponse } from "@/lib/tenant-utility-response";

export const maxDuration = 30;

/**
 * GET /api/tenants/[id]/utilities[?format=pdf] — manager tier. The tenant's
 * approved meter readings (newest first) with each one's charge, invoice and
 * paid / part-paid / unpaid status, plus billed / paid / unpaid per utility.
 * `format=pdf` returns the tenant's utility statement.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, select: { unit: { select: { propertyId: true } } } });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });
  const access = await requirePropertyAccess(tenant.unit.propertyId);
  if (!access.ok) return access.error!;

  return tenantUtilitiesResponse(params.id, new URL(req.url).searchParams.get("format"));
}
