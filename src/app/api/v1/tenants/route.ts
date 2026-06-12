export const dynamic = "force-dynamic";

import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/v1/tenants?propertyId=&active=&cursor=&limit=
 * Org-scoped tenant list (public API, read-only). Cursor-paginated.
 */
export async function GET(req: Request) {
  const { ctx, error } = await authenticateApiKey(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const active = searchParams.get("active");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200);

  const tenants = await prisma.tenant.findMany({
    where: {
      unit: {
        property: {
          organizationId: ctx!.organizationId,
          ...(propertyId ? { id: propertyId } : {}),
        },
      },
      ...(active === "true" ? { isActive: true } : active === "false" ? { isActive: false } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      monthlyRent: true,
      depositAmount: true,
      leaseStart: true,
      leaseEnd: true,
      isActive: true,
      unit: {
        select: {
          id: true,
          unitNumber: true,
          property: { select: { id: true, name: true, currency: true } },
        },
      },
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = tenants.length > limit;
  const page = hasMore ? tenants.slice(0, limit) : tenants;

  return Response.json({
    data: page,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  });
}
