import { getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { format } from "date-fns";
import { generateInvoicesForTenants } from "@/lib/invoice-generation";

const bulkSchema = z.object({
  year:  z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  /** Due date offset in days from start of month (default 5) */
  dueDayOfMonth: z.number().int().min(1).max(28).default(5),
  /** Optional: restrict generation to a single property */
  propertyId: z.string().optional(),
});

export async function POST(req: Request) {
  const { error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { year, month, dueDayOfMonth, propertyId: filterPropertyId } = parsed.data;

  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  // Fetch active long-term tenants accessible to this user (optionally scoped to one property)
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      unit: {
        property: {
          id:   { in: effectivePropertyIds },
          type: "LONGTERM",
        },
      },
    },
    include: {
      unit: { select: { id: true, unitNumber: true, propertyId: true, type: true } },
      // Escalation timeline — period amounts sum the rent that applies to
      // each covered month (a mid-period escalation bills correctly).
      rentHistory: { select: { monthlyRent: true, effectiveDate: true } },
    },
  });

  if (tenants.length === 0) {
    return Response.json({ created: 0, skipped: 0, errors: [], message: "No active long-term tenants found" });
  }

  const result = await generateInvoicesForTenants({ tenants, year, month, dueDayOfMonth });

  const periodLabel = format(new Date(year, month - 1, 1), "MMM yyyy");
  const created = result.created.map((c) => c.tenantName);
  const skipped = result.skipped.map((s) => s.tenantName);
  const notDue  = result.notDue.map((s) => s.tenantName);
  const errors  = result.errors.map(({ tenant, error: err }) => ({ tenant, error: err }));

  return Response.json({
    created: created.length,
    skipped: skipped.length,
    notDue:  notDue.length,
    errors:  errors.length,
    createdNames: created,
    skippedNames: skipped,
    notDueNames:  notDue,
    errorDetails: errors,
    message:
      `Generated ${created.length} invoice${created.length !== 1 ? "s" : ""} for ${periodLabel}` +
      `${skipped.length > 0 ? `, ${skipped.length} already existed` : ""}` +
      `${notDue.length > 0 ? `, ${notDue.length} not due (covered by advance billing)` : ""}`,
  }, { status: 201 });
}
