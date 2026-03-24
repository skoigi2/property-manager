import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (ids === null) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  // Build asset filter
  const assetWhere = {
    propertyId: propertyId ? propertyId : { in: ids },
  };

  // Fetch all active maintenance schedules across accessible assets
  const schedules = await prisma.assetMaintenanceSchedule.findMany({
    where: {
      isActive: true,
      asset: assetWhere,
    },
    include: {
      asset: {
        select: {
          id: true,
          name: true,
          category: true,
          categoryOther: true,
          property: { select: { id: true, name: true } },
          unit: { select: { unitNumber: true } },
        },
      },
    },
    orderBy: [
      { nextDue: "asc" },
    ],
  });

  // YTD maintenance cost
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytdAgg = await prisma.assetMaintenanceLog.aggregate({
    where: {
      date: { gte: yearStart },
      asset: assetWhere,
    },
    _sum: { cost: true },
  });

  return Response.json({
    schedules,
    ytdCost: ytdAgg._sum.cost ?? 0,
  });
}
