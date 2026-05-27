import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { checkoutProcessSchema } from "@/lib/validations";

async function loadTenant(id: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const tenant = await prisma.tenant.findFirst({
    where: { id, unit: { propertyId: { in: propertyIds } } },
    include: {
      unit: {
        include: {
          property: {
            include: { organization: true },
          },
        },
      },
      checkoutProcess: { include: { deductions: true } },
    },
  });
  if (!tenant) return { error: Response.json({ error: "Tenant not found" }, { status: 404 }) };
  return { tenant };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { tenant, error: notFound } = await loadTenant(params.id);
  if (notFound) return notFound;

  // Compute outstanding invoice balance: SUM(totalAmount - paidAmount) over unpaid statuses.
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: tenant!.id,
      status: { in: ["DRAFT", "SENT", "OVERDUE"] },
    },
    select: { totalAmount: true, paidAmount: true },
  });
  const outstandingBalance = invoices.reduce(
    (sum, inv) => sum + (inv.totalAmount - (inv.paidAmount ?? 0)),
    0
  );

  return Response.json({
    tenant: {
      id: tenant!.id,
      name: tenant!.name,
      email: tenant!.email,
      phone: tenant!.phone,
      depositAmount: tenant!.depositAmount,
      monthlyRent: tenant!.monthlyRent,
      leaseStart: tenant!.leaseStart,
      leaseEnd: tenant!.leaseEnd,
      isActive: tenant!.isActive,
    },
    unit: {
      id: tenant!.unit.id,
      unitNumber: tenant!.unit.unitNumber,
      type: tenant!.unit.type,
    },
    property: {
      id: tenant!.unit.property.id,
      name: tenant!.unit.property.name,
      currency: tenant!.unit.property.currency,
      organizationId: tenant!.unit.property.organizationId,
    },
    organization: tenant!.unit.property.organization
      ? { id: tenant!.unit.property.organization.id, name: tenant!.unit.property.organization.name }
      : null,
    outstandingBalance,
    checkout: tenant!.checkoutProcess ?? null,
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { tenant, error: notFound } = await loadTenant(params.id);
  if (notFound) return notFound;

  const existing = tenant!.checkoutProcess;
  if (existing && existing.status === "COMPLETED") {
    return Response.json({ error: "Checkout already finalized" }, { status: 409 });
  }

  const body = await req.json();
  const parsed = checkoutProcessSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const totalDeductions = data.deductions.reduce((s, d) => s + d.amount, 0);
  const balanceToRefund =
    tenant!.depositAmount -
    (data.damageFound ? data.inventoryDamageAmount : 0) -
    data.rentBalanceOwing -
    totalDeductions;

  const baseFields = {
    unitId: tenant!.unit.id,
    propertyId: tenant!.unit.property.id,
    organizationId: tenant!.unit.property.organizationId,
    checkOutDate: new Date(data.checkOutDate),
    damageFound: data.damageFound,
    inventoryDamageAmount: data.damageFound ? data.inventoryDamageAmount : 0,
    inventoryDamageNotes: data.inventoryDamageNotes ?? null,
    damageKeptByLandlord: data.damageKeptByLandlord,
    rentBalanceOwing: data.rentBalanceOwing,
    rentBalanceSource: data.rentBalanceSource ?? null,
    originalDeposit: tenant!.depositAmount,
    totalDeductions,
    balanceToRefund,
    keysReturned: (data.keysReturned ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    utilityTransfers: (data.utilityTransfers ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    refundMethod: data.refundMethod ?? null,
    refundDetails: (data.refundDetails ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    notes: data.notes ?? null,
  };

  let checkoutId: string;

  if (existing) {
    await prisma.$transaction([
      prisma.checkoutDeduction.deleteMany({ where: { checkoutId: existing.id } }),
      prisma.checkoutProcess.update({
        where: { id: existing.id },
        data: baseFields,
      }),
      prisma.checkoutDeduction.createMany({
        data: data.deductions.map((d) => ({
          checkoutId: existing.id,
          description: d.description,
          amount: d.amount,
          category: d.category,
        })),
      }),
    ]);
    checkoutId = existing.id;
  } else {
    const created = await prisma.checkoutProcess.create({
      data: {
        tenantId: tenant!.id,
        ...baseFields,
        deductions: {
          create: data.deductions.map((d) => ({
            description: d.description,
            amount: d.amount,
            category: d.category,
          })),
        },
      },
    });
    checkoutId = created.id;
  }

  const fresh = await prisma.checkoutProcess.findUnique({
    where: { id: checkoutId },
    include: { deductions: true },
  });
  return Response.json(fresh, { status: existing ? 200 : 201 });
}
