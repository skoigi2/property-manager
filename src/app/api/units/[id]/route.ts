import { requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  unitNumber: z.string().min(1).optional(),
  type: z.enum(["BEDSITTER", "ONE_BED", "TWO_BED", "THREE_BED", "FOUR_BED", "PENTHOUSE", "COMMERCIAL", "OTHER"]).optional(),
  status: z.enum(["ACTIVE", "VACANT", "LISTED", "UNDER_NOTICE", "MAINTENANCE", "OWNER_OCCUPIED"]).optional(),
  monthlyRent: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional()),
  floor: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().optional()),
  sizeSqm: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional()),
  description: z.string().optional(),
});

async function getUnitWithAccess(id: string) {
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) return { unit: null, accessError: Response.json({ error: "Not found" }, { status: 404 }) };
  const access = await requirePropertyAccess(unit.propertyId);
  if (!access.ok) return { unit: null, accessError: access.error! };
  return { unit, accessError: null };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { unit, accessError } = await getUnitWithAccess(params.id);
  if (accessError) return accessError;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // If changing unit number, check for duplicate
  if (parsed.data.unitNumber && parsed.data.unitNumber !== unit!.unitNumber) {
    const dup = await prisma.unit.findFirst({
      where: { propertyId: unit!.propertyId, unitNumber: parsed.data.unitNumber, NOT: { id: params.id } },
    });
    if (dup) return Response.json({ error: "Unit number already exists in this property" }, { status: 409 });
  }

  // Track vacancy start date
  const updateData: any = { ...parsed.data };
  if (parsed.data.status) {
    const wasVacant = unit!.status === "VACANT" || unit!.status === "LISTED";
    const becomingVacant = parsed.data.status === "VACANT" || parsed.data.status === "LISTED";
    const becomingActive = parsed.data.status === "ACTIVE";
    if (becomingVacant && !wasVacant) {
      updateData.vacantSince = new Date();
    } else if (becomingActive && wasVacant) {
      updateData.vacantSince = null;
    }
  }

  const updated = await prisma.unit.update({ where: { id: params.id }, data: updateData });
  return Response.json(updated);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { unit, accessError } = await getUnitWithAccess(params.id);
  if (accessError) return accessError;

  // Prevent deletion if unit has active tenants
  const activeTenant = await prisma.tenant.findFirst({ where: { unitId: unit!.id, isActive: true } });
  if (activeTenant) {
    return Response.json({ error: "Cannot delete a unit with an active tenant. Vacate the tenant first." }, { status: 409 });
  }

  await prisma.unit.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
