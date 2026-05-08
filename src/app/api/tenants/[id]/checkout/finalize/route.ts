import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { checkoutProcessSchema } from "@/lib/validations";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findFirst({
    where: { id: params.id, unit: { propertyId: { in: propertyIds } } },
    include: {
      unit: { include: { property: true } },
      checkoutProcess: { include: { deductions: true } },
    },
  });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  if (tenant.checkoutProcess?.status === "COMPLETED") {
    return Response.json({ error: "Checkout already finalized" }, { status: 409 });
  }

  const body = await req.json();
  const parsed = checkoutProcessSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const totalDeductions = data.deductions.reduce((s, d) => s + d.amount, 0);
  const inventoryDamage = data.damageFound ? data.inventoryDamageAmount : 0;
  const balanceToRefund =
    tenant.depositAmount - inventoryDamage - data.rentBalanceOwing - totalDeductions;
  const checkOutDate = new Date(data.checkOutDate);

  // Step 1: upsert + replace deductions, then atomically finalize.
  const checkoutId = tenant.checkoutProcess?.id;

  const baseFields = {
    unitId: tenant.unit.id,
    propertyId: tenant.unit.property.id,
    organizationId: tenant.unit.property.organizationId,
    checkOutDate,
    damageFound: data.damageFound,
    inventoryDamageAmount: inventoryDamage,
    inventoryDamageNotes: data.inventoryDamageNotes ?? null,
    damageKeptByLandlord: data.damageKeptByLandlord,
    rentBalanceOwing: data.rentBalanceOwing,
    rentBalanceSource: data.rentBalanceSource ?? null,
    originalDeposit: tenant.depositAmount,
    totalDeductions,
    balanceToRefund,
    keysReturned: (data.keysReturned ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    utilityTransfers: (data.utilityTransfers ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    refundMethod: data.refundMethod ?? null,
    refundDetails: (data.refundDetails ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    notes: data.notes ?? null,
  };

  let processId: string;
  if (checkoutId) {
    await prisma.$transaction([
      prisma.checkoutDeduction.deleteMany({ where: { checkoutId } }),
      prisma.checkoutProcess.update({ where: { id: checkoutId }, data: baseFields }),
      prisma.checkoutDeduction.createMany({
        data: data.deductions.map((d) => ({
          checkoutId,
          description: d.description,
          amount: d.amount,
          category: d.category,
        })),
      }),
    ]);
    processId = checkoutId;
  } else {
    const created = await prisma.checkoutProcess.create({
      data: {
        tenantId: tenant.id,
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
    processId = created.id;
  }

  // Step 2: atomic close-out — pgBouncer-safe array form.
  const ops: ReturnType<typeof prisma.checkoutProcess.update>[] = [];

  // Optional ExpenseEntry for landlord-kept damage
  let createdExpenseId: string | null = null;
  if (data.damageFound && data.damageKeptByLandlord && inventoryDamage > 0) {
    const expense = await prisma.expenseEntry.create({
      data: {
        date: checkOutDate,
        unitId: tenant.unit.id,
        propertyId: tenant.unit.property.id,
        scope: "UNIT",
        category: "REINSTATEMENT",
        amount: inventoryDamage,
        description: `Move-out damage charge — ${tenant.name} (Unit ${tenant.unit.unitNumber})${
          data.inventoryDamageNotes ? ` — ${data.inventoryDamageNotes}` : ""
        }`,
      },
    });
    createdExpenseId = expense.id;
  }

  // Mirror DepositSettlement for legacy reporting (only if not already settled)
  const existingSettlement = await prisma.depositSettlement.findUnique({
    where: { tenantId: tenant.id },
  });

  const settlementDeductions = [
    ...(inventoryDamage > 0 ? [{ reason: "Inventory damage", amount: inventoryDamage }] : []),
    ...(data.rentBalanceOwing > 0 ? [{ reason: "Rent balance", amount: data.rentBalanceOwing }] : []),
    ...data.deductions.map((d) => ({ reason: d.description, amount: d.amount })),
  ];
  const settlementTotalDeductions = inventoryDamage + data.rentBalanceOwing + totalDeductions;

  const tenantBefore = {
    isActive: tenant.isActive,
    vacatedDate: tenant.vacatedDate,
    unitStatus: tenant.unit.status,
  };

  await prisma.$transaction([
    prisma.checkoutProcess.update({
      where: { id: processId },
      data: {
        status: "COMPLETED",
        finalizedAt: new Date(),
        finalizedByUserId: session!.user.id,
        expenseEntryId: createdExpenseId,
      },
    }),
    ...(existingSettlement
      ? []
      : [
          prisma.depositSettlement.create({
            data: {
              tenantId: tenant.id,
              depositHeld: tenant.depositAmount,
              deductions: settlementDeductions,
              totalDeductions: settlementTotalDeductions,
              netRefunded: balanceToRefund,
              settledDate: checkOutDate,
              notes: data.notes ?? null,
            },
          }),
        ]),
    prisma.tenant.update({
      where: { id: tenant.id },
      data: { isActive: false, vacatedDate: checkOutDate },
    }),
    prisma.unit.update({
      where: { id: tenant.unit.id },
      data: { status: "VACANT", vacantSince: checkOutDate },
    }),
  ]);

  // Audit logs (after the transaction so they can't break the operation).
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Tenant",
    resourceId: tenant.id,
    organizationId: session!.user.organizationId,
    before: tenantBefore,
    after: { isActive: false, vacatedDate: checkOutDate, unitStatus: "VACANT" },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "CheckoutProcess",
    resourceId: processId,
    organizationId: session!.user.organizationId,
    after: {
      tenantId: tenant.id,
      status: "COMPLETED",
      originalDeposit: tenant.depositAmount,
      totalDeductions: settlementTotalDeductions,
      balanceToRefund,
      expenseEntryId: createdExpenseId,
    },
  });

  // Suppress unused warning for ops scaffold (we kept it for clarity, but didn't need it).
  void ops;

  return Response.json({ ok: true, checkoutId: processId, balanceToRefund });
}
