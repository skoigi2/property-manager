import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { approveReadingsSchema } from "@/lib/validations";
import { approveReadings } from "@/lib/utility-readings";

/**
 * POST /api/utilities/readings/approve { ids } — manager tier. Approving a
 * unit reading snapshots the tariff in force (or the meter's own rate) and
 * computes the charge; bulk / common meters are approved without a price.
 * Per-reading failures (no tariff, reading below the previous one) are
 * reported back without aborting the rest.
 */
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = approveReadingsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Pick at least one reading to approve" }, { status: 400 });

  const result = await approveReadings(parsed.data.ids, propertyIds, session!);

  if (result.approved.length > 0) {
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "MeterReading",
      resourceId: result.approved.slice(0, 8).join(", ").slice(0, 190),
      organizationId: session!.user.organizationId,
      after: { approved: result.approved.length, failed: result.errors.length },
    });
  }

  return Response.json({ approved: result.approved.length, errors: result.errors });
}
