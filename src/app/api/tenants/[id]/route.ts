import { requireAuth, requireManager, requirePropertyAccess, requireManagerWrite, requirePermissionWrite} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tenantSchema } from "@/lib/validations";
import { z } from "zod";

async function loadTenantPropertyId(tenantId: string): Promise<string | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { unit: { select: { propertyId: true } } },
  });
  return t?.unit.propertyId ?? null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyId = await loadTenantPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      unit: {
        include: {
          property: { select: { id: true, name: true, type: true, currency: true, manager: { select: { name: true, email: true } } } },
          // Include all income entries for the unit (tenantId filter applied in UI)
          incomeEntries: {
            select: {
              id: true, date: true, type: true, grossAmount: true,
              agentCommission: true, note: true, tenantId: true,
            },
            orderBy: { date: "asc" },
          },
        },
      },
      // Rent escalation timeline — the ledger resolves each month's expected
      // rent from this instead of assuming today's monthlyRent applied forever.
      rentHistory: {
        select: { monthlyRent: true, effectiveDate: true },
        orderBy: { effectiveDate: "asc" },
      },
    },
  });

  if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(tenant);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManagerWrite();
  if (error) return error;

  const propertyId = await loadTenantPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = tenantSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { leaseStart, leaseEnd, ...rest } = parsed.data;

  // Keep the rent timeline complete: a direct edit that changes monthlyRent
  // appends a RentHistory row (the renewal flow already does this), so
  // historical "expected rent" resolution stays accurate.
  const before = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { monthlyRent: true },
  });
  const rentChanged =
    typeof rest.monthlyRent === "number" &&
    before !== null &&
    rest.monthlyRent !== before.monthlyRent;

  const ops: any[] = [
    prisma.tenant.update({
      where: { id: params.id },
      data: {
        ...rest,
        leaseStart: new Date(leaseStart),
        leaseEnd: leaseEnd ? new Date(leaseEnd) : null,
      },
      include: {
        unit: { include: { property: { select: { id: true, name: true, type: true } } } },
      },
    }),
  ];
  if (rentChanged) {
    ops.push(
      prisma.rentHistory.create({
        data: {
          tenantId:      params.id,
          monthlyRent:   rest.monthlyRent,
          effectiveDate: new Date(),
          reason:        "Rent updated",
        },
      }),
    );
  }
  const [tenant] = await prisma.$transaction(ops);

  return Response.json(tenant);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManagerWrite();
  if (error) return error;

  const propertyId = await loadTenantPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Partial update: interest toggle (income page) or a quick lease-end fix
  // (the "Lease date TBC" inline action on the tenants banner).
  const parsed = z
    .object({
      chargeLatePenalty: z.boolean().optional(),
      leaseEnd: z.string().min(1).optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.chargeLatePenalty === undefined && parsed.data.leaseEnd === undefined) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  const leaseEndDate = parsed.data.leaseEnd ? new Date(parsed.data.leaseEnd) : undefined;
  if (leaseEndDate && isNaN(leaseEndDate.getTime())) {
    return Response.json({ error: "Invalid lease end date" }, { status: 400 });
  }

  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.chargeLatePenalty !== undefined
        ? { chargeLatePenalty: parsed.data.chargeLatePenalty }
        : {}),
      ...(leaseEndDate ? { leaseEnd: leaseEndDate } : {}),
    },
    select: { id: true, chargeLatePenalty: true, leaseEnd: true },
  });

  return Response.json(tenant);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requirePermissionWrite("TENANT_LIFECYCLE");
  if (error) return error;

  const propertyId = await loadTenantPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  await prisma.tenant.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return Response.json({ success: true });
}
