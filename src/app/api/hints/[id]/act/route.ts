import { requireAuthWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Mark a hint as ACTED_ON (optimistic from the client after firing the
 * underlying actionEndpoint). Idempotent.
 */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireAuthWrite();
  if (error) return error;

  // Same scoping as dismiss: only a hint on a property the caller can access.
  const hint = await prisma.actionableHint.findUnique({ where: { id: params.id }, select: { propertyId: true } });
  if (!hint) return Response.json({ error: "Not found" }, { status: 404 });
  if (hint.propertyId) {
    const access = await requirePropertyAccess(hint.propertyId);
    if (!access.ok) return access.error!;
  }

  const updated = await prisma.actionableHint.update({
    where: { id: params.id },
    data: { status: "ACTED_ON", actedAt: new Date() },
  });
  return Response.json(updated);
}
