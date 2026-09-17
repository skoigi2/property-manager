import { requireManager, requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { billReadingsSchema } from "@/lib/validations";
import { billApprovedReadings, unbilledApprovedReadings } from "@/lib/utility-readings";

export const maxDuration = 60;

/**
 * GET /api/utilities/bill?propertyId=&year=&month= — preview: how many
 * tenants have approved readings not yet on an invoice of that month, and
 * how much. (year, month) is the INVOICE period; readings of earlier months
 * are billable on it.
 */
export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!propertyId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return Response.json({ error: "Pick a property and month" }, { status: 400 });
  }
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const pending = await unbilledApprovedReadings({ propertyId, invoiceYear: year, invoiceMonth: month });
  let readings = 0;
  let water = 0;
  let electricity = 0;
  pending.forEach((p) => {
    readings += p.readingIds.length;
    water += p.waterAmount;
    electricity += p.electricityAmount;
  });
  return Response.json({
    tenants: pending.size,
    readings,
    waterAmount: Math.round(water * 100) / 100,
    electricityAmount: Math.round(electricity * 100) / 100,
  });
}

/**
 * POST /api/utilities/bill { propertyId, year, month } — manager tier. Puts
 * every approved, unbilled reading onto an invoice of that month: merged into
 * the tenant's invoice while nothing has been paid on it (rent invoice
 * preferred, so utilities go out with the rent), else a utilities-only
 * invoice. `merged` rows that were already SENT should be re-sent.
 */
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const parsed = billReadingsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Pick a property and month" }, { status: 400 });
  const { propertyId, year, month } = parsed.data;

  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { organizationId: true } });
  const result = await billApprovedReadings({ propertyId, invoiceYear: year, invoiceMonth: month });

  if (result.merged.length + result.created.length > 0) {
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "CREATE",
      resource: "Invoice",
      resourceId: `utility billing ${year}-${String(month).padStart(2, "0")}`,
      organizationId: property?.organizationId ?? session!.user.organizationId,
      after: {
        propertyId,
        merged: result.merged.map((m) => m.invoiceNumber),
        created: result.created.map((c) => c.invoiceNumber),
        errors: result.errors.length,
      },
    });
  }

  return Response.json(result);
}
