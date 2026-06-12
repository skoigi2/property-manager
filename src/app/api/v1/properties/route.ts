export const dynamic = "force-dynamic";

import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/v1/properties — org-scoped property list (public API, read-only). */
export async function GET(req: Request) {
  const { ctx, error } = await authenticateApiKey(req);
  if (error) return error;

  const properties = await prisma.property.findMany({
    where: { organizationId: ctx!.organizationId },
    select: {
      id: true,
      name: true,
      type: true,
      category: true,
      address: true,
      city: true,
      currency: true,
      createdAt: true,
      _count: { select: { units: true } },
    },
    orderBy: { name: "asc" },
  });

  return Response.json({
    data: properties.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      category: p.category,
      address: p.address,
      city: p.city,
      currency: p.currency,
      unitCount: p._count.units,
      createdAt: p.createdAt,
    })),
  });
}
