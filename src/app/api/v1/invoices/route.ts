export const dynamic = "force-dynamic";

import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/v1/invoices?status=&propertyId=&cursor=&limit=
 * Org-scoped invoice list (public API, read-only). Cursor-paginated.
 */
export async function GET(req: Request) {
  const { ctx, error } = await authenticateApiKey(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const propertyId = searchParams.get("propertyId");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200);

  const invoices = await prisma.invoice.findMany({
    where: {
      tenant: {
        unit: {
          property: {
            organizationId: ctx!.organizationId,
            ...(propertyId ? { id: propertyId } : {}),
          },
        },
      },
      ...(status ? { status: status as never } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      periodYear: true,
      periodMonth: true,
      totalAmount: true,
      status: true,
      dueDate: true,
      paidAt: true,
      paidAmount: true,
      createdAt: true,
      tenant: {
        select: {
          id: true,
          name: true,
          unit: {
            select: {
              unitNumber: true,
              property: { select: { id: true, name: true, currency: true } },
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = invoices.length > limit;
  const page = hasMore ? invoices.slice(0, limit) : invoices;

  return Response.json({
    data: page,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  });
}
