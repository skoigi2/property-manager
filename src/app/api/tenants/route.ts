import { requireSession, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { tenantSchema } from "@/lib/validations";
import { TENANT_DIRECTORY_SELECT, tenantReadIsDirectory } from "@/lib/tenant-projection";

export async function GET(req: Request) {
  // Any role — but CARETAKER (and anyone passing ?projection=directory) only
  // ever gets the directory shape: id, name, phone, unit. Never rent, deposit,
  // lease terms, ID numbers, notes or the portal token.
  const { session, error } = await requireSession();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unitId = searchParams.get("unitId");
  const activeOnly = searchParams.get("activeOnly") === "true";
  const filterPropertyId = searchParams.get("propertyId");
  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  if (tenantReadIsDirectory(session!.user.orgRole, searchParams.get("projection") === "directory")) {
    const directory = await prisma.tenant.findMany({
      where: {
        unit: { propertyId: { in: effectivePropertyIds } },
        ...(unitId ? { unitId } : {}),
        isActive: true,
      },
      select: TENANT_DIRECTORY_SELECT,
      orderBy: [{ unit: { unitNumber: "asc" } }, { name: "asc" }],
      take: 2000,
    });
    return Response.json(directory);
  }

  const tenants = await prisma.tenant.findMany({
    where: {
      unit: { propertyId: { in: effectivePropertyIds } },
      ...(unitId ? { unitId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    include: {
      unit: {
        include: { property: { select: { id: true, name: true, type: true, currency: true } } },
      },
      // Rent escalation timeline — consumers resolve per-month expected rent
      // from this (see src/lib/rent-resolution.ts) instead of assuming the
      // current monthlyRent applied to past months.
      rentHistory: {
        select: { monthlyRent: true, effectiveDate: true },
        orderBy: { effectiveDate: "asc" },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 2000, // safety cap for very large portfolios
  });

  // Deposit receipt trail per tenant (Σ DEPOSIT entries). null = no receipts
  // recorded — consumers must treat the contractual depositAmount as
  // UNVERIFIED in that case (see src/lib/deposit.ts), never as cash held.
  const depositSums = await prisma.incomeEntry.groupBy({
    by: ["tenantId"],
    where: { tenantId: { in: tenants.map((t) => t.id) }, type: "DEPOSIT" },
    _sum: { grossAmount: true },
  });
  const receivedByTenant = new Map(depositSums.map((g) => [g.tenantId, g._sum.grossAmount ?? 0]));

  return Response.json(
    tenants.map((t) => ({
      ...t,
      depositReceived: receivedByTenant.has(t.id) ? receivedByTenant.get(t.id) : null,
    })),
  );
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = tenantSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { leaseStart, leaseEnd, unitId, ...rest } = parsed.data;

  const [tenant] = await prisma.$transaction([
    prisma.tenant.create({
      data: {
        ...rest,
        unitId,
        leaseStart: new Date(leaseStart),
        leaseEnd: leaseEnd ? new Date(leaseEnd) : null,
      },
      include: {
        unit: { include: { property: { select: { id: true, name: true, type: true } } } },
      },
    }),
    prisma.unit.update({
      where: { id: unitId },
      data: { status: "ACTIVE" },
    }),
  ]);

  return Response.json(tenant, { status: 201 });
}
