import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { expenseEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { getActiveTaxConfigs, matchConfig, buildTaxSnapshot, lineItemCategoryToAppliesTo } from "@/lib/tax-engine";

const EXPENSE_INCLUDE = {
  unit: { select: { unitNumber: true, property: { select: { name: true } } } },
  property: { select: { name: true } },
  vendor: { select: { id: true, name: true, category: true, phone: true } },
  lineItems: { orderBy: { createdAt: "asc" as const } },
  unitAllocations: {
    include: { unit: { select: { unitNumber: true, propertyId: true } } },
    orderBy: { unit: { unitNumber: "asc" as const } },
  },
  // Receipt/document count — drives the paperclip badge without loading docs.
  _count: { select: { documents: true } },
};

export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sessionOrgId = session!.user.organizationId ?? null;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unitId = searchParams.get("unitId");
  const propertyId = searchParams.get("propertyId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const category = searchParams.get("category");

  // Range params (YYYY-MM-DD, used by period exports) take precedence over the
  // single year+month pair. Parsed component-wise to stay timezone-safe.
  const parseDay = (s: string | null, endOfDay: boolean): Date | null => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d);
  };
  const rangeFrom = parseDay(searchParams.get("from"), false);
  const rangeTo = parseDay(searchParams.get("to"), true);

  let dateFilter = {};
  if (rangeFrom || rangeTo) {
    dateFilter = { date: { ...(rangeFrom ? { gte: rangeFrom } : {}), ...(rangeTo ? { lte: rangeTo } : {}) } };
  } else if (year && month) {
    const from = new Date(parseInt(year), parseInt(month) - 1, 1);
    const to = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
    dateFilter = { date: { gte: from, lte: to } };
  }

  const effectivePropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const where = {
    OR: [
      { propertyId: { in: effectivePropertyIds } },
      { unit: { propertyId: { in: effectivePropertyIds } } },
      { unitAllocations: { some: { unit: { propertyId: { in: effectivePropertyIds } } } } },
      // True portfolio-scope expenses carry no property/unit at all — without
      // this arm they were invisible in the list (the bulk route and petty-cash
      // GET already include the equivalent). Only in the unscoped view: a
      // single-property filter shouldn't show org-wide costs. Org-scoped via
      // organizationId (legacy null-org rows stay visible; super-admin —
      // session org null — sees all).
      ...(propertyId ? [] : [{
        AND: [
          { propertyId: null },
          { unitId: null },
          ...(sessionOrgId ? [{ OR: [{ organizationId: sessionOrgId }, { organizationId: null }] }] : []),
        ],
      }]),
    ],
    ...(unitId ? { unitId } : {}),
    ...(category ? { category: category as never } : {}),
    ...dateFilter,
  };

  // ?count=true → row count only (not subject to the take cap below). Used by
  // the "Delete all" confirm dialog so it doesn't fetch thousands of rows.
  if (searchParams.get("count") === "true") {
    const count = await prisma.expenseEntry.count({ where });
    return Response.json({ count });
  }

  // Exports may raise the row cap explicitly (bounded so it can't be abused).
  const take = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "2000") || 2000, 1), 20000);

  const entries = await prisma.expenseEntry.findMany({
    where,
    include: EXPENSE_INCLUDE,
    orderBy: { date: "desc" },
    // Safety cap — the UI always month-filters; exports pass ?limit= to raise it.
    take,
  });

  return Response.json(entries);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = expenseEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const vendorId = body.vendorId as string | undefined | null;
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

  // Pre-load tax configs for the property so we can apply snapshots to line items
  const taxPropertyId = resolvedPropertyId ?? (resolvedUnitId
    ? (await prisma.unit.findUnique({ where: { id: resolvedUnitId }, select: { propertyId: true } }))?.propertyId
    : undefined);
  const taxOrgId = session!.user.organizationId;
  const taxConfigs = taxPropertyId && taxOrgId
    ? await getActiveTaxConfigs(taxPropertyId, taxOrgId)
    : [];

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

  // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
  // Nested writes (unitAllocations / lineItems via `create`) let us atomically
  // create the children without needing the parent id in the callback.
  const lineItemRows = lineItems?.map(({ id: _id, ...item }) => {
    const isVatable = item.isVatable ?? false;
    const taxSnapshot = isVatable
      ? buildTaxSnapshot(item.amount, matchConfig(taxConfigs, lineItemCategoryToAppliesTo(item.category)))
      : { taxConfigId: null, taxRate: null, taxAmount: null, taxType: null };
    return {
      category: item.category,
      description: item.description,
      amount: item.amount,
      isVatable,
      paymentStatus: item.paymentStatus ?? "UNPAID",
      amountPaid: item.amountPaid ?? 0,
      paymentReference: item.paymentReference,
      ...taxSnapshot,
    };
  }) ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [
    prisma.expenseEntry.create({
      data: {
        date: parsedDate,
        scope: rest.scope,
        category: rest.category,
        amount: computedAmount,
        description: rest.description,
        isSunkCost: rest.isSunkCost ?? false,
        paidFromPettyCash: paidFromPettyCash ?? false,
        // Line items, when present, are the source of truth for paid amounts + tax.
        amountPaid: lineItemRows.length > 0 ? 0 : rest.amountPaid ?? 0,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : null,
        vatAmount: lineItemRows.length > 0 ? null : rest.vatAmount ?? null,
        paymentMethod: rest.paymentMethod ?? null,
        paymentReference: rest.paymentReference || null,
        paymentDate: rest.paymentDate ? new Date(rest.paymentDate) : null,
        notes: rest.notes || null,
        vendorId: vendorId || null,
        unitId: resolvedUnitId,
        propertyId: resolvedPropertyId,
        organizationId: session!.user.organizationId ?? null,
        ...(unitIds && unitIds.length > 0
          ? { unitAllocations: { create: unitIds.map((uid) => ({ unitId: uid, shareAmount })) } }
          : {}),
        ...(lineItemRows.length > 0 ? { lineItems: { create: lineItemRows } } : {}),
        // Nested create links the petty-cash OUT row to this expense, so a
        // later delete cascades and the ledger stays in sync.
        ...(paidFromPettyCash
          ? {
              pettyCashEntry: {
                create: {
                  date: parsedDate,
                  type: "OUT",
                  amount: computedAmount,
                  description: rest.description ?? `${rest.category} expense`,
                  propertyId: pettyCashPropertyId,
                  organizationId: session!.user.organizationId ?? null,
                },
              },
            }
          : {}),
      },
      include: EXPENSE_INCLUDE,
    }),
  ];
  const txResults = await prisma.$transaction(ops);
  const entry = txResults[0];

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
    organizationId: session!.user.organizationId,
    after: { category: entry.category, amount: entry.amount, date: entry.date },
  });

  return Response.json(full, { status: 201 });
}
