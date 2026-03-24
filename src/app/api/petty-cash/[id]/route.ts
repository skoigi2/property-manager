import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const before = await prisma.pettyCash.findUnique({ where: { id: params.id }, select: { type: true, amount: true, date: true } });
  await prisma.pettyCash.delete({ where: { id: params.id } });
  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "DELETE", resource: "PettyCash", resourceId: params.id, before });
  return Response.json({ success: true });
}
