import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { expenseEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { getActiveTaxConfigs, matchConfig, buildTaxSnapshot, lineItemCategoryToAppliesTo } from "@/lib/tax-engine";
import { calcQtyRateAmount, normalizeLineItemUnit, calcLinePaymentStatus } from "@/lib/calculations";
import { resolveExpenseTargets } from "@/lib/expense-scope";
import { checkExpenseTargets } from "@/lib/expense-targets";

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
  const { date, paidFromPettyCash, unitIds: rawUnitIds, lineItems, ...rest } = parsed.data;
  const parsedDate = new Date(date);

  // Scope decides which target ids count (stale ids from a form that switched
  // scope are dropped), split units must share one property, and the caller
  // must actually have access to that property.
  const targets = await checkExpenseTargets(
    resolveExpenseTargets(rest.scope, { unitId: rest.unitId, unitIds: rawUnitIds, propertyId: rest.propertyId }),
  );
  if (!targets.ok) return Response.json({ error: targets.error }, { status: targets.status });
  const { unitIds, unitId: resolvedUnitId, effectivePropertyId } = targets;
  const isMultiUnit = unitIds.length > 1;
  // A split across several units is stored against their (shared) property;
  // a single-unit expense resolves its property through the unit relation.
  const resolvedPropertyId = isMultiUnit ? effectivePropertyId : targets.propertyId;

  // Derive each line's net amount: qty x rate (rounded to 2dp) when both are
  // present, else the typed amount. The derived value IS the stored `amount`.
  const lineItemAmounts = (lineItems ?? []).map((item) =>
    item.quantity != null && item.unitRate != null
      ? calcQtyRateAmount(item.quantity, item.unitRate)
      : item.amount
  );

  // Compute amount from line items when provided
  const computedAmount =
    lineItems && lineItems.length > 0
      ? lineItemAmounts.reduce((sum, a) => sum + a, 0)
      : rest.amount;

  // Rate as of the expense date: a backdated entry gets the rate in force
  // then, not today's (the snapshot is stored absolute, never recomputed).
  const taxOrgId = session!.user.organizationId;
  const taxConfigs = effectivePropertyId && taxOrgId
    ? await getActiveTaxConfigs(effectivePropertyId, taxOrgId, parsedDate)
    : [];

  const pettyCashPropertyId = paidFromPettyCash ? effectivePropertyId ?? null : null;

  const shareAmount = isMultiUnit ? computedAmount / unitIds.length : computedAmount;

  // Petty cash pays the whole bill the moment it is logged: the OUT row has
  // already left the tin. Stamp the payment fields so the derived status is
  // PAID without the user retyping the amount (and so exports agree).
  const pettySettled = !!paidFromPettyCash;

  // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
  // Nested writes (unitAllocations / lineItems via `create`) let us atomically
  // create the children without needing the parent id in the callback.
  const lineItemRows = lineItems?.map(({ id: _id, ...item }, i) => {
    const amount = lineItemAmounts[i]; // qty×rate-derived when both present
    const isVatable = item.isVatable ?? false;
    // VAT is computed on the net (already-discounted) `amount` — discountAmount
    // is informational only and never enters the tax base or any total.
    const taxSnapshot = isVatable
      ? buildTaxSnapshot(amount, matchConfig(taxConfigs, lineItemCategoryToAppliesTo(item.category)))
      : { taxConfigId: null, taxRate: null, taxAmount: null, taxType: null };
    return {
      category: item.category,
      description: item.description,
      date: item.date ? new Date(item.date) : null,
      amount,
      quantity: item.quantity ?? null,
      unitRate: item.unitRate ?? null,
      // Descriptive only — unitOther kept only when unit = OTHER.
      ...normalizeLineItemUnit(item.unit, item.unitOther),
      discountAmount: item.discountAmount ?? null,
      isVatable,
      // Status is derived from the paid amount, never trusted from the client.
      amountPaid: pettySettled ? amount : item.amountPaid ?? 0,
      paymentStatus: calcLinePaymentStatus(amount, pettySettled ? amount : item.amountPaid ?? 0),
      paymentReference: item.paymentReference,
      paymentDate: item.paymentDate ? new Date(item.paymentDate) : pettySettled ? parsedDate : null,
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
        amountPaid: lineItemRows.length > 0 ? 0 : pettySettled ? computedAmount : rest.amountPaid ?? 0,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : null,
        vatAmount: lineItemRows.length > 0 ? null : rest.vatAmount ?? null,
        // Informational only — never subtracted from `amount`, never in totals.
        // With line items, discounts live on the items instead.
        discountAmount: lineItemRows.length > 0 ? null : rest.discountAmount ?? null,
        paymentMethod: rest.paymentMethod ?? (pettySettled ? "CASH" : null),
        paymentReference: rest.paymentReference || null,
        paymentDate: rest.paymentDate ? new Date(rest.paymentDate) : pettySettled ? parsedDate : null,
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
