import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { error, session } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const resource = searchParams.get("resource");
  const userId   = searchParams.get("userId");
  const limit    = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const offset   = parseInt(searchParams.get("offset") ?? "0");

  const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;
  const orgFilter = isSuperAdmin ? {} : { organizationId: session!.user.organizationId };

  const where = {
    ...orgFilter,
    ...(resource ? { resource } : {}),
    ...(userId   ? { userId }   : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return Response.json({ logs, total, limit, offset });
}
