import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  requireManagerWrite,
  requirePermissionWrite,
  getAccessiblePropertyIds,
} from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { validateAllocations } from "@/lib/vendor-payments";
import { buildExpensePaidOps, getAllocationSums, type TxOp } from "@/lib/vendor-payment-sync";

const allocationSchema = z.object({
  expenseEntryId: z.string().min(1),
  amount: z.number().positive(),
});

const patchSchema = z.object({
  paymentDate: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  /** Full replacement of the allocation set when provided. */
  allocations: z.array(allocationSchema).optional(),
});

const PAYMENT_INCLUDE = {
  vendor: { select: { id: true, name: true } },
  allocations: {
    select: {
      id: true,
      amount: true,
      expenseEntryId: true,
      expenseEntry: {
        select: {
          id: true, date: true, category: true, description: true,
          property: { select: { name: true } },
        },
      },
    },
  },
} as const;

async function loadScopedPayment(id: string, orgId: string | null) {
  const payment = await prisma.vendorPayment.findUnique({
    where: { id },
    include: PAYMENT_INCLUDE,
  });
  if (!payment) return null;
  // Another org's row looks nonexistent (404), per the property-less
  // financial-row rules; null-org rows are grandfathered visible.
  if (orgId && payment.organizationId !== null && payment.organizationId !== orgId) return null;
  return payment;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const payment = await loadScopedPayment(params.id, session!.user.organizationId ?? null);
  if (!payment) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(payment);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const orgId = session!.user.organizationId ?? null;
  const existing = await loadScopedPayment(params.id, orgId);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { paymentDate, amount, paymentMethod, reference, notes, allocations } = parsed.data;

  const nextAmount = amount ?? existing.amount;
  const nextAllocations =
    allocations ?? existing.allocations.map((a) => ({ expenseEntryId: a.expenseEntryId, amount: a.amount }));

  const allocError = validateAllocations(nextAmount, nextAllocations);
  if (allocError) return Response.json({ error: allocError }, { status: 400 });

  const ops: TxOp[] = [];

  if (allocations) {
    const propertyIds = (await getAccessiblePropertyIds()) ?? [];
    // Every expense touched by either the old or the new allocation set must
    // be recomputed (removed ones drop back to their other-payment sum).
    const touchedIds = Array.from(
      new Set([
        ...existing.allocations.map((a) => a.expenseEntryId),
        ...allocations.map((a) => a.expenseEntryId),
      ])
    );

    const expenses = touchedIds.length
      ? await prisma.expenseEntry.findMany({
          where: { id: { in: touchedIds } },
          select: {
            id: true, vendorId: true, propertyId: true, unitId: true, organizationId: true,
            unit: { select: { propertyId: true } },
            lineItems: { select: { id: true, amount: true }, orderBy: { id: "asc" } },
          },
        })
      : [];
    const byId = new Map(expenses.map((e) => [e.id, e]));

    for (const alloc of allocations) {
      const e = byId.get(alloc.expenseEntryId);
      if (!e) return Response.json({ error: "Allocated expense not found" }, { status: 404 });
      if (e.vendorId !== existing.vendorId) {
        return Response.json({ error: "Expense belongs to a different vendor" }, { status: 400 });
      }
      const linkedPropertyId = e.propertyId ?? e.unit?.propertyId ?? null;
      const accessible = linkedPropertyId
        ? propertyIds.includes(linkedPropertyId)
        : !orgId || e.organizationId === orgId || e.organizationId === null;
      if (!accessible) {
        return Response.json({ error: "Allocated expense not found" }, { status: 404 });
      }
    }

    // Sums excluding this payment — its allocation set is being replaced.
    const otherSums = await getAllocationSums(touchedIds, existing.id);
    const newByExpense = new Map(allocations.map((a) => [a.expenseEntryId, a.amount]));

    ops.push(
      prisma.vendorPaymentAllocation.deleteMany({ where: { vendorPaymentId: existing.id } })
    );
    if (allocations.length > 0) {
      ops.push(
        prisma.vendorPaymentAllocation.createMany({
          data: allocations.map((a) => ({
            vendorPaymentId: existing.id,
            expenseEntryId: a.expenseEntryId,
            amount: a.amount,
          })),
        })
      );
    }
    for (const id of touchedIds) {
      const e = byId.get(id);
      if (!e) continue; // expense deleted meanwhile — nothing to recompute
      const paidTotal = (otherSums.get(id) ?? 0) + (newByExpense.get(id) ?? 0);
      ops.push(...buildExpensePaidOps(e, paidTotal));
    }
  }

  ops.push(
    prisma.vendorPayment.update({
      where: { id: existing.id },
      data: {
        ...(paymentDate !== undefined ? { paymentDate: new Date(paymentDate) } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(paymentMethod !== undefined ? { paymentMethod } : {}),
        ...(reference !== undefined ? { reference: reference || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
      },
    })
  );

  await prisma.$transaction(ops);
  const updated = await prisma.vendorPayment.findUnique({
    where: { id: existing.id },
    include: PAYMENT_INCLUDE,
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email ?? undefined,
    action: "UPDATE",
    resource: "VendorPayment",
    resourceId: existing.id,
    organizationId: orgId ?? undefined,
    before: {
      amount: existing.amount,
      paymentDate: existing.paymentDate,
      allocations: existing.allocations.map((a) => ({ expenseEntryId: a.expenseEntryId, amount: a.amount })),
    },
    after: parsed.data as object,
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  // Destroying a payment rewrites paid positions — ACCOUNTANT is blocked,
  // consistent with invoice/expense deletes.
  const { session, error } = await requirePermissionWrite("FINANCIAL_DELETE");
  if (error) return error;

  const orgId = session!.user.organizationId ?? null;
  const existing = await loadScopedPayment(params.id, orgId);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const touchedIds = existing.allocations.map((a) => a.expenseEntryId);
  const expenses = touchedIds.length
    ? await prisma.expenseEntry.findMany({
        where: { id: { in: touchedIds } },
        select: {
          id: true,
          lineItems: { select: { id: true, amount: true }, orderBy: { id: "asc" } },
        },
      })
    : [];

  // Reverse: each touched expense drops back to the sum of its allocations
  // from OTHER payments (deleting the payment cascades its allocations away).
  const otherSums = await getAllocationSums(touchedIds, existing.id);
  const ops: TxOp[] = [
    prisma.vendorPayment.delete({ where: { id: existing.id } }),
  ];
  for (const e of expenses) {
    ops.push(...buildExpensePaidOps(e, otherSums.get(e.id) ?? 0));
  }
  await prisma.$transaction(ops);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email ?? undefined,
    action: "DELETE",
    resource: "VendorPayment",
    resourceId: existing.id,
    organizationId: orgId ?? undefined,
    before: {
      vendorId: existing.vendorId,
      amount: existing.amount,
      paymentDate: existing.paymentDate,
      reference: existing.reference,
      allocations: existing.allocations.map((a) => ({ expenseEntryId: a.expenseEntryId, amount: a.amount })),
    },
  });

  return Response.json({ success: true });
}
