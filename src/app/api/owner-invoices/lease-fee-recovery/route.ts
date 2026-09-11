import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { leaseFeeRecoveryStatus } from "@/lib/lease-fee-recovery";

// GET /api/owner-invoices/lease-fee-recovery?propertyId=
// Lease preparation fees received from tenants (LEASE_FEE income entries) vs
// what has been recovered from the owner on management-fee invoices.
export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const effective = filterPropertyId && propertyIds.includes(filterPropertyId) ? [filterPropertyId] : propertyIds;

  const [entries, ownerInvoices] = await Promise.all([
    prisma.incomeEntry.findMany({
      where: { type: "LEASE_FEE", unit: { propertyId: { in: effective } } },
      orderBy: { date: "desc" },
      select: {
        id: true, date: true, grossAmount: true, unitId: true, tenantId: true,
        tenant: { select: { name: true } },
        unit: { select: { unitNumber: true, propertyId: true, property: { select: { name: true, currency: true } } } },
      },
    }),
    prisma.ownerInvoice.findMany({
      where: { propertyId: { in: effective }, status: { not: "CANCELLED" } },
      select: { id: true, invoiceNumber: true, status: true, periodYear: true, periodMonth: true, lineItems: true },
    }),
  ]);

  const status = leaseFeeRecoveryStatus(
    entries.map((e) => ({
      id: e.id,
      date: e.date,
      grossAmount: e.grossAmount,
      unitId: e.unitId,
      tenantId: e.tenantId,
      tenantName: e.tenant?.name ?? null,
      unitNumber: e.unit.unitNumber,
      propertyId: e.unit.propertyId,
      propertyName: e.unit.property.name,
    })),
    ownerInvoices,
  );

  return Response.json(status);
}
