import { requireManager, requireRolesWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { utilityTariffSchema } from "@/lib/validations";

/** GET /api/utilities/tariffs?propertyId= — manager tier; newest first. */
export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId) return Response.json({ error: "Pick a property" }, { status: 400 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const tariffs = await prisma.utilityTariff.findMany({
    where: { propertyId },
    orderBy: [{ utility: "asc" }, { effectiveFrom: "desc" }],
  });
  return Response.json(tariffs);
}

/**
 * POST /api/utilities/tariffs — ADMIN / MANAGER (what tenants are charged is
 * not an accountant's call). Tariffs are time-sliced: a new rate is a new row
 * with its own effectiveFrom, so readings already approved keep the rate they
 * were approved at. Posting the same property + utility + month replaces that
 * month's row.
 */
export async function POST(req: Request) {
  const { session, error } = await requireRolesWrite(["ADMIN", "MANAGER"]);
  if (error) return error;

  const parsed = utilityTariffSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid tariff" }, { status: 400 });
  const d = parsed.data;

  const access = await requirePropertyAccess(d.propertyId);
  if (!access.ok) return access.error!;

  const raw = new Date(d.effectiveFrom);
  if (isNaN(raw.getTime())) return Response.json({ error: "Invalid start month" }, { status: 400 });
  // Tariffs start on the first of a month.
  const effectiveFrom = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), 1));

  const property = await prisma.property.findUnique({ where: { id: d.propertyId }, select: { organizationId: true } });
  if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

  const existing = await prisma.utilityTariff.findFirst({
    where: { propertyId: d.propertyId, utility: d.utility, effectiveFrom },
  });
  const data = {
    supplyRate: d.supplyRate,
    fuelRate: d.utility === "ELECTRICITY" ? d.fuelRate : 0,
    notes: d.notes?.trim() || null,
    createdByName: session!.user.name ?? session!.user.email ?? null,
  };
  const tariff = existing
    ? await prisma.utilityTariff.update({ where: { id: existing.id }, data })
    : await prisma.utilityTariff.create({ data: { propertyId: d.propertyId, utility: d.utility, effectiveFrom, ...data } });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: existing ? "UPDATE" : "CREATE",
    resource: "UtilityTariff",
    resourceId: tariff.id,
    organizationId: property.organizationId ?? session!.user.organizationId,
    ...(existing ? { before: { supplyRate: existing.supplyRate, fuelRate: existing.fuelRate } } : {}),
    after: { utility: tariff.utility, effectiveFrom: tariff.effectiveFrom, supplyRate: tariff.supplyRate, fuelRate: tariff.fuelRate },
  });

  return Response.json(tariff, { status: existing ? 200 : 201 });
}
