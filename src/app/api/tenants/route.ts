import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tenantSchema } from "@/lib/validations";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unitId = searchParams.get("unitId");
  const activeOnly = searchParams.get("activeOnly") === "true";

  const tenants = await prisma.tenant.findMany({
    where: {
      unit: { propertyId: { in: propertyIds } },
      ...(unitId ? { unitId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    include: {
      unit: {
        include: { property: { select: { name: true, type: true } } },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return Response.json(tenants);
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = tenantSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { leaseStart, leaseEnd, unitId, ...rest } = parsed.data;

  const [tenant] = await prisma.$transaction([
    prisma.tenant.create({
      data: {
        ...rest,
        unitId,
        leaseStart: new Date(leaseStart),
        leaseEnd: leaseEnd ? new Date(leaseEnd) : null,
      },
      include: {
        unit: { include: { property: { select: { name: true, type: true } } } },
      },
    }),
    prisma.unit.update({
      where: { id: unitId },
      data: { status: "ACTIVE" },
    }),
  ]);

  return Response.json(tenant, { status: 201 });
}
