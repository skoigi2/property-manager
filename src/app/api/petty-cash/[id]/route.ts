import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  await prisma.pettyCash.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
