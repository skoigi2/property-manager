import { requireManager, requirePropertyAccess, requireManagerWrite, requirePermissionWrite} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { expenseEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { deleteFromStorage } from "@/lib/supabase-storage";
import { getActiveTaxConfigs, matchConfig, buildTaxSnapshot, lineItemCategoryToAppliesTo } from "@/lib/tax-engine";
import { calcQtyRateAmount, normalizeLineItemUnit } from "@/lib/calculations";

const EXPENSE_INCLUDE = {
  unit: { select: { unitNumber: true } },
  property: { select: { name: true } },
  vendor: { select: { id: true, name: true, category: true, phone: true } },
  lineItems: { orderBy: { createdAt: "asc" as const } },
  unitAllocations: {
    include: { unit: { select: { unitNumber: true, propertyId: true } } },
    orderBy: { unit: { unitNumber: "asc" as const } },
  },
};

// PORTFOLIO-scope expenses legitimately have no property (propertyId and
// unitId both null) — distinguish "doesn't exist" from "exists, org-wide".
// When no property resolves, the org check below (organizationId stamped on
// create; legacy null-org rows grandfathered) plus the requireManagerWrite /
// requirePermissionWrite gate is the access check; a 404 here would make
// portfolio expenses permanently un-editable and un-deletable.
async function loadExpensePropertyId(id: string): Promise<{ exists: boolean; propertyId: string | null; organizationId: string | null }> {
  const e = await prisma.expenseEntry.findUnique({
    where: { id },
    select: {
      propertyId: true,
      organizationId: true,
      unit: { select: { propertyId: true } },
    },
  });
  if (!e) return { exists: false, propertyId: null, organizationId: null };
  return { exists: true, propertyId: e.propertyId ?? e.unit?.propertyId ?? null, organizationId: e.organizationId };
}

/** Portfolio rows: another org's expense must look like it doesn't exist. */
function orgMismatch(rowOrgId: string | null, sessionOrgId: string | null | undefined): boolean {
  return !!rowOrgId && !!sessionOrgId && rowOrgId !== sessionOrgId;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const { exists, propertyId, organizationId } = await loadExpensePropertyId(params.id);
  if (!exists) return Response.json({ error: "Not found" }, { status: 404 });
  if (propertyId) {
    const access = await requirePropertyAccess(propertyId);
    if (!access.ok) return access.error!;
  } else if (orgMismatch(organizationId, session!.user.organizationId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = expenseEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const vendorId = body.vendorId as string | undefined | null;
  const { date, paidFromPettyCash, unitIds, lineItems, ...rest } = parsed.data;
  const parsedDate = new Date(date);

  // Derive each line's net amount: qty × rate (rounded to 2dp) when both are
  // present, else the typed amount. The derived value IS the stored `amount`.
  const lineItemAmounts = (lineItems ?? []).map((item) =>
    item.quantity != null && item.unitRate != null
      ? calcQtyRateAmount(item.quantity, item.unitRate)
      : item.amount
  );

  // Compute amount from line items
  const computedAmount =
    lineItems && lineItems.length > 0
      ? lineItemAmounts.reduce((sum, a) => sum + a, 0)
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

  // Tax configs for line-item snapshots. The replace-all recreate below used to
  // drop the tax snapshot on every edit (taxAmount silently wiped); mirror the
  // POST route instead and re-snapshot at save time from the current configs.
  const taxPropertyId = resolvedPropertyId ?? (resolvedUnitId
    ? (await prisma.unit.findUnique({ where: { id: resolvedUnitId }, select: { propertyId: true } }))?.propertyId
    : undefined);
  const taxOrgId = session!.user.organizationId;
  const taxConfigs = lineItems && lineItems.length > 0 && taxPropertyId && taxOrgId
    ? await getActiveTaxConfigs(taxPropertyId, taxOrgId, parsedDate)
    : [];

  const before = await prisma.expenseEntry.findUnique({
    where: { id: params.id },
    select: {
      category: true, amount: true, date: true,
      paidFromPettyCash: true,
      pettyCashEntry: { select: { id: true } },
    },
  });

  // Petty-cash reconciliation — keep the linked OUT row in sync with the flag.
  const nowPetty = paidFromPettyCash ?? false;
  const linkedPettyCashId = before?.pettyCashEntry?.id ?? null;
  let pettyCashPropertyId: string | null = null;
  if (nowPetty) {
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

  // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [
    prisma.expenseEntry.update({
      where: { id: params.id },
      data: {
        date: parsedDate,
        scope: rest.scope,
        category: rest.category,
        amount: computedAmount,
        description: rest.description,
        isSunkCost: rest.isSunkCost ?? false,
        paidFromPettyCash: paidFromPettyCash ?? false,
        // Line items, when present, are the source of truth for paid amounts + tax.
        amountPaid: lineItems && lineItems.length > 0 ? 0 : rest.amountPaid ?? 0,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : null,
        vatAmount: lineItems && lineItems.length > 0 ? null : rest.vatAmount ?? null,
        // Informational only — never subtracted from `amount`, never in totals.
        discountAmount: lineItems && lineItems.length > 0 ? null : rest.discountAmount ?? null,
        paymentMethod: rest.paymentMethod ?? null,
        paymentReference: rest.paymentReference || null,
        paymentDate: rest.paymentDate ? new Date(rest.paymentDate) : null,
        notes: rest.notes || null,
        vendorId: vendorId !== undefined ? (vendorId || null) : undefined,
        unitId: resolvedUnitId ?? null,
        propertyId: resolvedPropertyId ?? null,
      },
    }),
    // Replace unit allocations — delete then (optionally) recreate.
    prisma.expenseUnitAllocation.deleteMany({ where: { expenseId: params.id } }),
    // Replace line items — same idea.
    prisma.expenseLineItem.deleteMany({ where: { expenseId: params.id } }),
  ];
  if (unitIds && unitIds.length > 0) {
    ops.push(prisma.expenseUnitAllocation.createMany({
      data: unitIds.map((uid) => ({ expenseId: params.id, unitId: uid, shareAmount })),
    }));
  }
  if (lineItems && lineItems.length > 0) {
    ops.push(prisma.expenseLineItem.createMany({
      data: lineItems.map(({ id: _id, ...item }, i) => {
        const amount = lineItemAmounts[i]; // qty×rate-derived when both present
        const isVatable = item.isVatable ?? false;
        // VAT is computed on the net (already-discounted) `amount` —
        // discountAmount never enters the tax base or any total.
        const taxSnapshot = isVatable
          ? buildTaxSnapshot(amount, matchConfig(taxConfigs, lineItemCategoryToAppliesTo(item.category)))
          : { taxConfigId: null, taxRate: null, taxAmount: null, taxType: null };
        return {
          expenseId: params.id,
          category: item.category,
          description: item.description,
          amount,
          quantity: item.quantity ?? null,
          unitRate: item.unitRate ?? null,
          // Descriptive only — unitOther kept only when unit = OTHER.
          ...normalizeLineItemUnit(item.unit, item.unitOther),
          discountAmount: item.discountAmount ?? null,
          isVatable,
          paymentStatus: item.paymentStatus ?? "UNPAID",
          amountPaid: item.amountPaid ?? 0,
          paymentReference: item.paymentReference,
          paymentDate: item.paymentDate ? new Date(item.paymentDate) : null,
          ...taxSnapshot,
        };
      }),
    }));
  }
  // Petty-cash ledger sync:
  // - flag turned off  → remove the linked OUT row
  // - still on + linked → update it in place (preserves approval/status fields)
  // - turned on (false→true) → create a linked row. Deliberately transition-only:
  //   pre-link expenses that already have an UNLINKED manual petty-cash row must
  //   not gain a second one.
  if (linkedPettyCashId && !nowPetty) {
    ops.push(prisma.pettyCash.delete({ where: { id: linkedPettyCashId } }));
  } else if (linkedPettyCashId && nowPetty) {
    ops.push(prisma.pettyCash.update({
      where: { id: linkedPettyCashId },
      data: {
        date: parsedDate,
        amount: computedAmount,
        description: rest.description ?? `${rest.category} expense`,
        propertyId: pettyCashPropertyId,
      },
    }));
  } else if (!linkedPettyCashId && nowPetty && before && !before.paidFromPettyCash) {
    ops.push(prisma.pettyCash.create({
      data: {
        date: parsedDate,
        type: "OUT",
        amount: computedAmount,
        description: rest.description ?? `${rest.category} expense`,
        propertyId: pettyCashPropertyId,
        expenseEntryId: params.id,
        organizationId: session!.user.organizationId ?? organizationId ?? null,
      },
    }));
  }
  await prisma.$transaction(ops);

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
    organizationId: session!.user.organizationId,
    before,
    after: { category: entry?.category, amount: entry?.amount, date: entry?.date },
  });

  return Response.json(entry);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requirePermissionWrite("FINANCIAL_DELETE");
  if (error) return error;

  const { exists, propertyId, organizationId } = await loadExpensePropertyId(params.id);
  if (!exists) return Response.json({ error: "Not found" }, { status: 404 });
  if (propertyId) {
    const access = await requirePropertyAccess(propertyId);
    if (!access.ok) return access.error!;
  } else if (orgMismatch(organizationId, session!.user.organizationId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

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
    organizationId: session!.user.organizationId,
    before,
  });

  return Response.json({ success: true });
}
