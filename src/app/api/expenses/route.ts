import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { expenseEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const EXPENSE_INCLUDE = {
  unit: { select: { unitNumber: true } },
  property: { select: { name: true } },
  lineItems: { orderBy: { createdAt: "asc" as const } },
  unitAllocations: {
    include: { unit: { select: { unitNumber: true, propertyId: true } } },
    orderBy: { unit: { unitNumber: "asc" as const } },
  },
};

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unitId = searchParams.get("unitId");
  const propertyId = searchParams.get("propertyId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const category = searchParams.get("category");

  let dateFilter = {};
  if (year && month) {
    const from = new Date(parseInt(year), parseInt(month) - 1, 1);
    const to = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
    dateFilter = { date: { gte: from, lte: to } };
  }

  const effectivePropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const entries = await prisma.expenseEntry.findMany({
    where: {
      OR: [
        { propertyId: { in: effectivePropertyIds } },
        { unit: { propertyId: { in: effectivePropertyIds } } },
        { unitAllocations: { some: { unit: { propertyId: { in: effectivePropertyIds } } } } },
      ],
      ...(unitId ? { unitId } : {}),
      ...(category ? { category: category as never } : {}),
      ...dateFilter,
    },
    include: EXPENSE_INCLUDE,
    orderBy: { date: "desc" },
  });

  return Response.json(entries);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = expenseEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, paidFromPettyCash, unitIds, lineItems, ...rest } = parsed.data;
  const parsedDate = new Date(date);

  // Compute amount from line items when provided
  const computedAmount =
    lineItems && lineItems.length > 0
      ? lineItems.reduce((sum, item) => sum + item.amount, 0)
      : rest.amount;

  // Determine unit / property resolution for multi-unit
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

  // Resolve propertyId for petty-cash scoping
  let pettyCashPropertyId: string | null = null;
  if (paidFromPettyCash) {
    if (resolvedPropertyId) {
      pettyCashPropertyId = resolvedPropertyId;
    } else if (resolvedUnitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: resolvedUnitId },
        select: { propertyId: true },
      });
      pettyCashPropertyId = unit?.propertyId ?? null;
    }
  }

  const shareAmount =
    isMultiUnit && unitIds ? computedAmount / unitIds.length : computedAmount;

  const [entry] = await prisma.$transaction(async (tx) => {
    const expense = await tx.expenseEntry.create({
      data: {
        date: parsedDate,
        scope: rest.scope,
        category: rest.category,
        amount: computedAmount,
        description: rest.description,
        isSunkCost: rest.isSunkCost ?? false,
        paidFromPettyCash: paidFromPettyCash ?? false,
        unitId: resolvedUnitId,
        propertyId: resolvedPropertyId,
      },
      include: EXPENSE_INCLUDE,
    });

    // Create unit allocations for multi-unit expenses
    if (unitIds && unitIds.length > 0) {
      await tx.expenseUnitAllocation.createMany({
        data: unitIds.map((uid) => ({
          expenseId: expense.id,
          unitId: uid,
          shareAmount,
        })),
      });
    }

    // Create line items
    if (lineItems && lineItems.length > 0) {
      await tx.expenseLineItem.createMany({
        data: lineItems.map(({ id: _id, ...item }) => ({
          expenseId: expense.id,
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

    // Petty cash OUT entry
    if (paidFromPettyCash) {
      await tx.pettyCash.create({
        data: {
          date: parsedDate,
          type: "OUT",
          amount: computedAmount,
          description: rest.description ?? `${rest.category} expense`,
          propertyId: pettyCashPropertyId,
        },
      });
    }

    return [expense];
  });

  // Re-fetch with all relations
  const full = await prisma.expenseEntry.findUnique({
    where: { id: entry.id },
    include: EXPENSE_INCLUDE,
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "ExpenseEntry",
    resourceId: entry.id,
    after: { category: entry.category, amount: entry.amount, date: entry.date },
  });

  return Response.json(full, { status: 201 });
}
