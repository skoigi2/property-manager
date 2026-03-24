import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const resource = searchParams.get("resource");
  const userId   = searchParams.get("userId");
  const limit    = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const offset   = parseInt(searchParams.get("offset") ?? "0");

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(resource ? { resource } : {}),
      ...(userId   ? { userId }   : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  const total = await prisma.auditLog.count({
    where: {
      ...(resource ? { resource } : {}),
      ...(userId   ? { userId }   : {}),
    },
  });

  return Response.json({ logs, total, limit, offset });
}
