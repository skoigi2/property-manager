import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { id: true, unit: { select: { property: { select: { id: true } } } } },
  });
  if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(tenant.unit.property.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const threads = await prisma.portalMessageThread.findMany({
    where: { tenantId: tenant.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, sender: true, createdAt: true },
      },
      _count: {
        select: {
          messages: { where: { sender: "TENANT", readByManagerAt: null } },
        },
      },
    },
  });

  return Response.json(
    threads.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      lastMessageAt: t.lastMessageAt,
      preview: t.messages[0]?.body.slice(0, 120) ?? "",
      lastSender: t.messages[0]?.sender ?? null,
      unreadCount: t._count.messages,
    }))
  );
}
