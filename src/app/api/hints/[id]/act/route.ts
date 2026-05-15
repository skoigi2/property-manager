import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Mark a hint as ACTED_ON (optimistic from the client after firing the
 * underlying actionEndpoint). Idempotent.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const updated = await prisma.actionableHint.update({
    where: { id: params.id },
    data: { status: "ACTED_ON", actedAt: new Date() },
  }).catch(() => null);

  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(updated);
}
