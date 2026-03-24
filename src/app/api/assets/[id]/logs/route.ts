import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const asset = await prisma.asset.findUnique({
      where: { id: params.id },
      select: { propertyId: true },
    });
    if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
    if (!propertyIds.includes(asset.propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const logs = await prisma.assetMaintenanceLog.findMany({
      where: { assetId: params.id },
      include: { schedule: { select: { taskName: true } } },
      orderBy: { date: "desc" },
    });

    return Response.json(logs);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
