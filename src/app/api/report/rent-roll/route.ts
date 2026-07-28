import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// ── GET /api/report/rent-roll?propertyId= ────────────────────────────────────
// Lease-snapshot rent roll: one row per unit (vacant units included) with the
// active tenant's lease terms. This is the document owners and banks ask for —
// distinct from the period-scoped rent-collection table in /report.
export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  const units = await prisma.unit.findMany({
    where: { propertyId: { in: effectivePropertyIds } },
    select: {
      id: true, unitNumber: true, type: true, floor: true, sizeSqm: true, status: true, vacantSince: true,
      property: { select: { id: true, name: true, currency: true } },
      tenants: {
        where: { isActive: true },
        select: {
          id: true, name: true, email: true, phone: true,
          leaseStart: true, leaseEnd: true, paymentFrequency: true,
          monthlyRent: true, serviceCharge: true, depositAmount: true,
          escalationRate: true,
        },
        orderBy: { leaseStart: "desc" },
        take: 1,
      },
    },
    orderBy: [{ property: { name: "asc" } }, { unitNumber: "asc" }],
  });

  const rows = units.map((u) => {
    const t = u.tenants[0] ?? null;
    return {
      propertyId: u.property.id,
      propertyName: u.property.name,
      currency: u.property.currency,
      unitNumber: u.unitNumber,
      unitType: u.type,
      floor: u.floor,
      sizeSqm: u.sizeSqm,
      occupied: !!t,
      vacantSince: t ? null : u.vacantSince,
      tenantName: t?.name ?? null,
      tenantEmail: t?.email ?? null,
      tenantPhone: t?.phone ?? null,
      leaseStart: t?.leaseStart ?? null,
      leaseEnd: t?.leaseEnd ?? null,
      paymentFrequency: t?.paymentFrequency ?? null,
      monthlyRent: t?.monthlyRent ?? null,
      serviceCharge: t?.serviceCharge ?? null,
      depositAmount: t?.depositAmount ?? null,
      escalationRate: t?.escalationRate ?? null,
    };
  });

  return Response.json({ generatedAt: new Date().toISOString(), rows });
}
