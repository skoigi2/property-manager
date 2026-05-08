import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { conditionReportCreateSchema } from "@/lib/validations";

async function loadUnit(unitId: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, propertyId: { in: propertyIds } },
    include: { property: { select: { id: true, organizationId: true } } },
  });
  if (!unit) return { error: Response.json({ error: "Unit not found" }, { status: 404 }) };
  return { unit };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { unit, error: notFound } = await loadUnit(params.id);
  if (notFound) return notFound;

  const reports = await prisma.conditionReport.findMany({
    where: { unitId: unit!.id },
    orderBy: { reportDate: "desc" },
    include: {
      tenant: { select: { id: true, name: true } },
      photos: { select: { id: true } },
    },
  });

  return Response.json(reports);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { unit, error: notFound } = await loadUnit(params.id);
  if (notFound) return notFound;

  const body = await req.json();
  const parsed = conditionReportCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // For tenant-linked reports, ensure the tenant lives in this unit.
  if (data.tenantId) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: data.tenantId, unitId: unit!.id },
      select: { id: true },
    });
    if (!tenant) return Response.json({ error: "Tenant does not match this unit" }, { status: 400 });
  }

  const report = await prisma.conditionReport.create({
    data: {
      unitId: unit!.id,
      propertyId: unit!.property.id,
      organizationId: unit!.property.organizationId,
      tenantId: data.tenantId ?? null,
      reportDate: new Date(data.reportDate),
      reportType: data.reportType,
      items: data.items as unknown as Prisma.InputJsonValue,
      overallComments: data.overallComments ?? null,
    },
  });

  return Response.json(report, { status: 201 });
}
