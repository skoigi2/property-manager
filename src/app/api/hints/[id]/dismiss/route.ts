import { requireAuth, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const hint = await prisma.actionableHint.findUnique({ where: { id: params.id } });
  if (!hint) return Response.json({ error: "Not found" }, { status: 404 });
  if (hint.propertyId) {
    const access = await requirePropertyAccess(hint.propertyId);
    if (!access.ok) return access.error!;
  }

  const updated = await prisma.actionableHint.update({
    where: { id: params.id },
    data: { status: "DISMISSED", dismissedAt: new Date(), dismissedByUserId: session!.user.id },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "ActionableHint",
    resourceId: params.id,
    organizationId: hint.organizationId,
    before: { status: "ACTIVE" },
    after: { status: "DISMISSED" },
  });

  return Response.json(updated);
}
