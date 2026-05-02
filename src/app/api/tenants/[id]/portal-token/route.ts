import { NextRequest } from "next/server";
import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// 90-day default TTL — was 1 year, which is too long for a credential that
// grants invoice + document access. Manager can rotate from the tenant detail page.
const PORTAL_TOKEN_TTL_DAYS = 90;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  // Verify the tenant is in a property the caller can access (closes IDOR).
  const t = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { unit: { select: { propertyId: true } } },
  });
  if (!t?.unit?.propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(t.unit.propertyId);
  if (!access.ok) return access.error!;

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: { portalToken: token, portalTokenExpiresAt: expiresAt },
    select: { id: true, portalToken: true, portalTokenExpiresAt: true },
  });

  return Response.json(tenant);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const t = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { unit: { select: { propertyId: true } } },
  });
  if (!t?.unit?.propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(t.unit.propertyId);
  if (!access.ok) return access.error!;

  await prisma.tenant.update({
    where: { id: params.id },
    data: { portalToken: null, portalTokenExpiresAt: null },
  });

  return Response.json({ ok: true });
}
