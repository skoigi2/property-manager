import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const vacateSchema = z.object({
  vacatedDate: z.string().optional(),
  notes:       z.string().max(500).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: { unit: true },
  });
  if (!tenant || !accessibleIds.includes(tenant.unit.propertyId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = vacateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { vacatedDate, notes } = parsed.data;

  const [updated] = await prisma.$transaction([
    prisma.tenant.update({
      where: { id: params.id },
      data: {
        isActive:    false,
        vacatedDate: vacatedDate ? new Date(vacatedDate) : new Date(),
        renewalNotes: notes ?? tenant.renewalNotes,
      },
      include: { unit: { include: { property: { select: { name: true, type: true } } } } },
    }),
    prisma.unit.update({
      where: { id: tenant.unitId },
      data: { status: "VACANT" },
    }),
  ]);

  return Response.json(updated);
}
