import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [feeConfigs, units, properties] = await Promise.all([
    prisma.managementFeeConfig.findMany({
      where: { unit: { propertyId: { in: propertyIds } } },
      include: { unit: { include: { property: true } } },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.unit.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: true },
      orderBy: { unitNumber: "asc" },
    }),
    prisma.property.findMany({
      where: { id: { in: propertyIds } },
    }),
  ]);

  return Response.json({ feeConfigs, units, properties });
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const { unitId, ratePercent, flatAmount, effectiveFrom, effectiveTo } = body;

  // Close previous config
  await prisma.managementFeeConfig.updateMany({
    where: { unitId, effectiveTo: null },
    data: { effectiveTo: new Date(effectiveFrom) },
  });

  const config = await prisma.managementFeeConfig.create({
    data: {
      unitId,
      ratePercent: parseFloat(ratePercent) || 0,
      flatAmount: flatAmount ? parseFloat(flatAmount) : null,
      effectiveFrom: new Date(effectiveFrom),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
    },
    include: { unit: { include: { property: true } } },
  });

  return Response.json(config, { status: 201 });
}
