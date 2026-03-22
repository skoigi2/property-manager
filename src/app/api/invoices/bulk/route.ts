import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { format } from "date-fns";

const bulkSchema = z.object({
  year:  z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  /** Due date offset in days from start of month (default 5) */
  dueDayOfMonth: z.number().int().min(1).max(28).default(5),
});

function generateInvoiceNumber(year: number, month: number, sequence: number) {
  return `INV-${year}${String(month).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { year, month, dueDayOfMonth } = parsed.data;

  // Fetch all active long-term tenants accessible to this user
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      unit: {
        property: {
          id:   { in: propertyIds },
          type: "LONGTERM",
        },
      },
    },
    include: {
      unit: { select: { id: true, unitNumber: true, propertyId: true, type: true } },
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
  const periodLabel = format(new Date(year, month - 1, 1), "MMM yyyy");

  const created: string[] = [];
  const skipped: string[] = [];
  const errors:  { tenant: string; error: string }[] = [];

  for (const tenant of tenants) {
    if (existingTenantIds.has(tenant.id)) {
      skipped.push(tenant.name);
      continue;
    }

    try {
      const invoiceNumber = generateInvoiceNumber(year, month, sequence++);
      const totalAmount   = (tenant.monthlyRent ?? 0) + (tenant.serviceCharge ?? 0);

      await prisma.invoice.create({
        data: {
          invoiceNumber,
          tenantId:     tenant.id,
          periodYear:   year,
          periodMonth:  month,
          rentAmount:   tenant.monthlyRent ?? 0,
          serviceCharge: tenant.serviceCharge ?? 0,
          otherCharges:  0,
          totalAmount,
          dueDate,
          status: "SENT",
          notes:  `Auto-generated for ${periodLabel}`,
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
    errors:  errors.length,
    createdNames: created,
    skippedNames: skipped,
    errorDetails: errors,
    message: `Generated ${created.length} invoice${created.length !== 1 ? "s" : ""} for ${periodLabel}${skipped.length > 0 ? `, ${skipped.length} already existed` : ""}`,
  }, { status: 201 });
}
