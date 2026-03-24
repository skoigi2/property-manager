import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; logId: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true },
  });
  if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const log = await prisma.assetMaintenanceLog.findUnique({
    where: { id: params.logId },
    select: { assetId: true },
  });
  if (!log || log.assetId !== params.id) {
    return Response.json({ error: "Log not found" }, { status: 404 });
  }

  try {
    await prisma.assetMaintenanceLog.delete({ where: { id: params.logId } });
    return new Response(null, { status: 204 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
