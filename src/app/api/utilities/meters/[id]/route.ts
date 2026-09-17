import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { updateMeterSchema } from "@/lib/validations";

async function loadMeter(id: string) {
  const meter = await prisma.utilityMeter.findUnique({
    where: { id },
    include: { property: { select: { organizationId: true } }, _count: { select: { readings: true } } },
  });
  if (!meter) return { error: Response.json({ error: "Meter not found" }, { status: 404 }) };
  const access = await requirePropertyAccess(meter.propertyId);
  if (!access.ok) return { error: access.error! };
  return { meter };
}

/** PATCH /api/utilities/meters/[id] — manager tier. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const loaded = await loadMeter(params.id);
  if ("error" in loaded) return loaded.error;
  const { meter } = loaded;

  const parsed = updateMeterSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid meter" }, { status: 400 });
  const d = parsed.data;

  // The opening reading is the "previous" of the first reading — once a
  // reading exists it has been snapshotted and changing it would mislead.
  if (d.openingReading !== undefined && d.openingReading !== meter.openingReading && meter._count.readings > 0) {
    return Response.json(
      { error: "This meter already has readings, so its opening reading can't change. Override the previous reading on the next reading instead." },
      { status: 409 },
    );
  }

  const updated = await prisma.utilityMeter.update({
    where: { id: meter.id },
    data: {
      ...(d.label !== undefined ? { label: d.label } : {}),
      ...(d.meterNumber !== undefined ? { meterNumber: d.meterNumber?.trim() || null } : {}),
      ...(d.openingReading !== undefined ? { openingReading: d.openingReading } : {}),
      ...(d.openingReadingDate !== undefined ? { openingReadingDate: d.openingReadingDate ? new Date(d.openingReadingDate) : null } : {}),
      ...(d.ratePerUnitOverride !== undefined ? { ratePerUnitOverride: meter.role === "UNIT" ? d.ratePerUnitOverride : null } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "UtilityMeter",
    resourceId: meter.id,
    organizationId: meter.property.organizationId ?? session!.user.organizationId,
    before: { label: meter.label, meterNumber: meter.meterNumber, ratePerUnitOverride: meter.ratePerUnitOverride, isActive: meter.isActive },
    after: { label: updated.label, meterNumber: updated.meterNumber, ratePerUnitOverride: updated.ratePerUnitOverride, isActive: updated.isActive },
  });

  return Response.json(updated);
}

/**
 * DELETE /api/utilities/meters/[id] — manager tier. A meter with readings is
 * history: 409 with `readingsCount` (deactivate it instead).
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const loaded = await loadMeter(params.id);
  if ("error" in loaded) return loaded.error;
  const { meter } = loaded;

  if (meter._count.readings > 0) {
    return Response.json(
      { error: "This meter has readings on record. Deactivate it instead of deleting it.", readingsCount: meter._count.readings },
      { status: 409 },
    );
  }

  await prisma.utilityMeter.delete({ where: { id: meter.id } });
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "UtilityMeter",
    resourceId: meter.id,
    organizationId: meter.property.organizationId ?? session!.user.organizationId,
    before: { utility: meter.utility, role: meter.role, label: meter.label, unitId: meter.unitId },
  });
  return new Response(null, { status: 204 });
}
