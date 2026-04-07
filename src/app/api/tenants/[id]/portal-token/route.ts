import { NextRequest } from "next/server";
import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

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

  await prisma.tenant.update({
    where: { id: params.id },
    data: { portalToken: null, portalTokenExpiresAt: null },
  });

  return Response.json({ ok: true });
}
