import { requireOpsStaff, requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createMeterSchema, bulkCreateMetersSchema } from "@/lib/validations";
import { canSeeUtilityMoney } from "@/lib/utility-readings";

/**
 * GET /api/utilities/meters?propertyId=&includeInactive=true
 * Ops staff incl. CARETAKER. The caretaker projection omits the meter's own
 * rate (ratePerUnitOverride) — they see what to read, never what it costs.
 */
export async function GET(req: Request) {
  const { session, error } = await requireOpsStaff();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  if (!propertyId) return Response.json({ error: "Pick a property" }, { status: 400 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const includeMoney = canSeeUtilityMoney(session!);
  const meters = await prisma.utilityMeter.findMany({
    where: { propertyId, ...(searchParams.get("includeInactive") === "true" && includeMoney ? {} : { isActive: true }) },
    select: {
      id: true, utility: true, role: true, label: true, meterNumber: true, unitId: true, isActive: true,
      openingReading: true, openingReadingDate: true,
      ratePerUnitOverride: includeMoney,
      unit: { select: { unitNumber: true } },
      _count: { select: { readings: true } },
    },
    orderBy: [{ utility: "asc" }, { role: "desc" }, { label: "asc" }],
  });

  return Response.json(
    meters
      .map((m) => ({
        id: m.id,
        utility: m.utility,
        role: m.role,
        label: m.label,
        meterNumber: m.meterNumber,
        unitId: m.unitId,
        unitNumber: m.unit?.unitNumber ?? null,
        isActive: m.isActive,
        openingReading: m.openingReading,
        openingReadingDate: m.openingReadingDate,
        readingsCount: m._count.readings,
        ...(includeMoney ? { ratePerUnitOverride: m.ratePerUnitOverride ?? null } : {}),
      }))
      .sort((a, b) => (a.unitNumber ?? "").localeCompare(b.unitNumber ?? "", undefined, { numeric: true })),
  );
}

/**
 * POST /api/utilities/meters — manager tier. Either one meter, or
 * `{ bulk: true, propertyId, utility, label }` to give every unit of the
 * property a meter in one go (units that already have one with that label
 * are skipped).
 */
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.bulk === true) {
    const parsed = bulkCreateMetersSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    const { propertyId, utility, label } = parsed.data;
    const access = await requirePropertyAccess(propertyId);
    if (!access.ok) return access.error!;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        organizationId: true,
        units: { select: { id: true, utilityMeters: { where: { utility, role: "UNIT", label }, select: { id: true } } } },
      },
    });
    if (!property) return Response.json({ error: "Property not found" }, { status: 404 });
    const missing = property.units.filter((u) => u.utilityMeters.length === 0);
    if (missing.length > 0) {
      await prisma.utilityMeter.createMany({
        data: missing.map((u) => ({
          organizationId: property.organizationId,
          propertyId,
          unitId: u.id,
          utility,
          role: "UNIT" as const,
          label,
        })),
      });
      await logAudit({
        userId: session!.user.id,
        userEmail: session!.user.email,
        action: "CREATE",
        resource: "UtilityMeter",
        resourceId: `bulk ${utility} ${propertyId}`.slice(0, 190),
        organizationId: property.organizationId ?? session!.user.organizationId,
        after: { created: missing.length, utility, label },
      });
    }
    return Response.json({ created: missing.length, skipped: property.units.length - missing.length }, { status: 201 });
  }

  const parsed = createMeterSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid meter" }, { status: 400 });
  const data = parsed.data;
  const access = await requirePropertyAccess(data.propertyId);
  if (!access.ok) return access.error!;

  const property = await prisma.property.findUnique({ where: { id: data.propertyId }, select: { organizationId: true } });
  if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

  let unitId: string | null = null;
  if (data.role === "UNIT") {
    const unit = await prisma.unit.findFirst({ where: { id: data.unitId!, propertyId: data.propertyId }, select: { id: true } });
    if (!unit) return Response.json({ error: "That unit does not belong to this property." }, { status: 400 });
    unitId = unit.id;
  }

  const meter = await prisma.utilityMeter.create({
    data: {
      organizationId: property.organizationId,
      propertyId: data.propertyId,
      unitId,
      utility: data.utility,
      role: data.role,
      label: data.label,
      meterNumber: data.meterNumber?.trim() || null,
      openingReading: data.openingReading,
      openingReadingDate: data.openingReadingDate ? new Date(data.openingReadingDate) : null,
      // Only a billed (unit) meter can carry its own rate.
      ratePerUnitOverride: data.role === "UNIT" ? data.ratePerUnitOverride ?? null : null,
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "UtilityMeter",
    resourceId: meter.id,
    organizationId: property.organizationId ?? session!.user.organizationId,
    after: { utility: meter.utility, role: meter.role, label: meter.label, unitId: meter.unitId, ratePerUnitOverride: meter.ratePerUnitOverride },
  });

  return Response.json(meter, { status: 201 });
}
