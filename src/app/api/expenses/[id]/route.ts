import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { expenseEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { deleteFromStorage } from "@/lib/supabase-storage";

const EXPENSE_INCLUDE = {
  unit: { select: { unitNumber: true } },
  property: { select: { name: true } },
  lineItems: { orderBy: { createdAt: "asc" as const } },
  unitAllocations: {
    include: { unit: { select: { unitNumber: true, propertyId: true } } },
    orderBy: { unit: { unitNumber: "asc" as const } },
  },
};

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = expenseEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, paidFromPettyCash, unitIds, lineItems, ...rest } = parsed.data;
  const parsedDate = new Date(date);

  // Compute amount from line items
  const computedAmount =
    lineItems && lineItems.length > 0
      ? lineItems.reduce((sum, item) => sum + item.amount, 0)
      : rest.amount;

  // Resolve unit / property for multi-unit
  const isMultiUnit = unitIds && unitIds.length > 1;
  let resolvedUnitId = rest.unitId;
  let resolvedPropertyId = rest.propertyId;

  if (isMultiUnit) {
    resolvedUnitId = undefined;
    const firstUnit = await prisma.unit.findUnique({
      where: { id: unitIds![0] },
      select: { propertyId: true },
    });
    resolvedPropertyId = firstUnit?.propertyId ?? undefined;
  } else if (unitIds && unitIds.length === 1) {
    resolvedUnitId = unitIds[0];
  }

  const shareAmount =
    isMultiUnit && unitIds ? computedAmount / unitIds.length : computedAmount;

  const before = await prisma.expenseEntry.findUnique({
    where: { id: params.id },
    select: { category: true, amount: true, date: true },
  });

  await prisma.$transaction(async (tx) => {
    // Update main expense record
    await tx.expenseEntry.update({
      where: { id: params.id },
      data: {
        date: parsedDate,
        scope: rest.scope,
        category: rest.category,
        amount: computedAmount,
        description: rest.description,
        isSunkCost: rest.isSunkCost ?? false,
        paidFromPettyCash: paidFromPettyCash ?? false,
        unitId: resolvedUnitId ?? null,
        propertyId: resolvedPropertyId ?? null,
      },
    });

    // Replace unit allocations
    await tx.expenseUnitAllocation.deleteMany({ where: { expenseId: params.id } });
    if (unitIds && unitIds.length > 0) {
      await tx.expenseUnitAllocation.createMany({
        data: unitIds.map((uid) => ({
          expenseId: params.id,
          unitId: uid,
          shareAmount,
        })),
      });
    }

    // Replace line items — delete all existing, re-create
    await tx.expenseLineItem.deleteMany({ where: { expenseId: params.id } });
    if (lineItems && lineItems.length > 0) {
      await tx.expenseLineItem.createMany({
        data: lineItems.map(({ id: _id, ...item }) => ({
          expenseId: params.id,
          category: item.category,
          description: item.description,
          amount: item.amount,
          isVatable: item.isVatable ?? false,
          paymentStatus: item.paymentStatus ?? "UNPAID",
          amountPaid: item.amountPaid ?? 0,
          paymentReference: item.paymentReference,
        })),
      });
    }
  });

  const entry = await prisma.expenseEntry.findUnique({
    where: { id: params.id },
    include: EXPENSE_INCLUDE,
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "ExpenseEntry",
    resourceId: params.id,
    before,
    after: { category: entry?.category, amount: entry?.amount, date: entry?.date },
  });

  return Response.json(entry);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const before = await prisma.expenseEntry.findUnique({
    where: { id: params.id },
    select: { category: true, amount: true, date: true },
  });

  // Clean up any attached documents from Supabase Storage before cascade delete
  const expenseDocs = await prisma.expenseDocument.findMany({
    where: { expenseId: params.id },
    select: { storagePath: true },
  });
  for (const doc of expenseDocs) {
    try { await deleteFromStorage(doc.storagePath); } catch { /* best effort */ }
  }

  await prisma.expenseEntry.delete({ where: { id: params.id } });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "ExpenseEntry",
    resourceId: params.id,
    before,
  });

  return Response.json({ success: true });
}
