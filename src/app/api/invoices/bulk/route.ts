import { requireManager, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { format } from "date-fns";
import { scheduledExpectedForMonth, frequencyMonths } from "@/lib/rent-schedule";
import { resolveExpectedRent } from "@/lib/rent-resolution";

const bulkSchema = z.object({
  year:  z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  /** Due date offset in days from start of month (default 5) */
  dueDayOfMonth: z.number().int().min(1).max(28).default(5),
  /** Optional: restrict generation to a single property */
  propertyId: z.string().optional(),
});

function generateInvoiceNumber(year: number, month: number, sequence: number) {
  return `INV-${year}${String(month).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
}

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

  // Fetch existing invoices for this period in one query
  const existingInvoices = await prisma.invoice.findMany({
    where: {
      periodYear:  year,
      periodMonth: month,
      tenantId:    { in: tenants.map((t) => t.id) },
    },
    select: { tenantId: true },
  });
  const existingTenantIds = new Set(existingInvoices.map((i) => i.tenantId));

  // Get current invoice count for sequence numbers
  const invoiceCount = await prisma.invoice.count();
  let   sequence     = invoiceCount + 1;

  const dueDate = new Date(year, month - 1, dueDayOfMonth);
  const periodStart = new Date(year, month - 1, 1);
  const periodLabel = format(periodStart, "MMM yyyy");

  const created: string[] = [];
  const skipped: string[] = [];
  const notDue:  string[] = [];
  const errors:  { tenant: string; error: string }[] = [];

  for (const tenant of tenants) {
    if (existingTenantIds.has(tenant.id)) {
      skipped.push(tenant.name);
      continue;
    }

    // Schedule-aware billing: quarterly/biannual/annual payers get ONE
    // invoice for the full period on their billing month (anchored to lease
    // start) and nothing in the covered months in between.
    const sched = scheduledExpectedForMonth({
      leaseStart: tenant.leaseStart,
      frequency: tenant.paymentFrequency,
      month: periodStart,
      rentForMonth: (m) => resolveExpectedRent(tenant.rentHistory, tenant.monthlyRent ?? 0, m),
    });
    if (!sched.due) {
      notDue.push(tenant.name);
      continue;
    }

    const nMonths = frequencyMonths(tenant.paymentFrequency);
    const coveredLabel =
      nMonths > 1
        ? `${format(periodStart, "MMM yyyy")} – ${format(new Date(year, month - 1 + nMonths - 1, 1), "MMM yyyy")}`
        : periodLabel;

    try {
      const invoiceNumber = generateInvoiceNumber(year, month, sequence++);
      const rentAmount    = sched.amount;
      const serviceCharge = (tenant.serviceCharge ?? 0) * nMonths;
      const totalAmount   = rentAmount + serviceCharge;

      await prisma.invoice.create({
        data: {
          invoiceNumber,
          tenantId:     tenant.id,
          periodYear:   year,
          periodMonth:  month,
          rentAmount,
          serviceCharge,
          otherCharges:  0,
          totalAmount,
          dueDate,
          status: "SENT",
          notes:
            nMonths > 1
              ? `Auto-generated — ${
                  { 3: "quarterly", 6: "bi-annual", 12: "annual" }[nMonths] ?? `${nMonths}-month`
                } billing covering ${coveredLabel}`
              : `Auto-generated for ${periodLabel}`,
        },
      });

      created.push(tenant.name);
    } catch (e) {
      errors.push({ tenant: tenant.name, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

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
