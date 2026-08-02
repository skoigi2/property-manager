import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  requireManagerWrite,
  getAccessiblePropertyIds,
} from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { validateAllocations } from "@/lib/vendor-payments";
import { buildExpensePaidOps, getAllocationSums, type TxOp } from "@/lib/vendor-payment-sync";

const allocationSchema = z.object({
  expenseEntryId: z.string().min(1),
  amount: z.number().positive(),
});

const createSchema = z.object({
  vendorId: z.string().min(1),
  paymentDate: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  allocations: z.array(allocationSchema).optional().default([]),
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

export async function GET(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const url = new URL(req.url);
  const vendorId = url.searchParams.get("vendorId");
  const orgId = session!.user.organizationId ?? null;

  const payments = await prisma.vendorPayment.findMany({
    where: {
      ...(vendorId ? { vendorId } : {}),
      // Org-scoped like other property-less financial rows: session org plus
      // grandfathered null-org rows; super-admin (org null) sees everything.
      ...(orgId ? { OR: [{ organizationId: orgId }, { organizationId: null }] } : {}),
    },
    include: PAYMENT_INCLUDE,
    orderBy: { paymentDate: "desc" },
    take: 500,
  });

  return Response.json(payments);
}

export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { vendorId, paymentDate, amount, paymentMethod, reference, notes, allocations } = parsed.data;

  const orgId = session!.user.organizationId ?? null;

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!vendor) return Response.json({ error: "Vendor not found" }, { status: 404 });
  if (orgId && vendor.organizationId !== null && vendor.organizationId !== orgId) {
    return Response.json({ error: "Vendor not found" }, { status: 404 });
  }

  const allocError = validateAllocations(amount, allocations);
  if (allocError) return Response.json({ error: allocError }, { status: 400 });

  const propertyIds = (await getAccessiblePropertyIds()) ?? [];
  const expenseIds = allocations.map((a) => a.expenseEntryId);

  let expenseOps: TxOp[] = [];
  if (expenseIds.length > 0) {
    const expenses = await prisma.expenseEntry.findMany({
      where: { id: { in: expenseIds } },
      select: {
        id: true, vendorId: true, propertyId: true, unitId: true, organizationId: true,
        unit: { select: { propertyId: true } },
        lineItems: { select: { id: true, amount: true }, orderBy: { id: "asc" } },
      },
    });
    const byId = new Map(expenses.map((e) => [e.id, e]));

    for (const alloc of allocations) {
      const e = byId.get(alloc.expenseEntryId);
      if (!e) return Response.json({ error: "Allocated expense not found" }, { status: 404 });
      if (e.vendorId !== vendorId) {
        return Response.json({ error: "Expense belongs to a different vendor" }, { status: 400 });
      }
      // Every allocated expense must be property-accessible, or an org-scoped
      // property-less row (session org or grandfathered null).
      const linkedPropertyId = e.propertyId ?? e.unit?.propertyId ?? null;
      const accessible = linkedPropertyId
        ? propertyIds.includes(linkedPropertyId)
        : !orgId || e.organizationId === orgId || e.organizationId === null;
      if (!accessible) {
        return Response.json({ error: "Allocated expense not found" }, { status: 404 });
      }
    }

    // Allocation-sum is the source of truth for the expense's paid position:
    // new paid total = allocations from other payments + this allocation.
    const existingSums = await getAllocationSums(expenseIds);
    expenseOps = allocations.flatMap((alloc) => {
      const e = byId.get(alloc.expenseEntryId)!;
      const paidTotal = (existingSums.get(alloc.expenseEntryId) ?? 0) + alloc.amount;
      return buildExpensePaidOps(e, paidTotal);
    });
  }

  const createOp = prisma.vendorPayment.create({
    data: {
      organizationId: orgId,
      vendorId,
      paymentDate: new Date(paymentDate),
      amount,
      paymentMethod,
      reference: reference || null,
      notes: notes || null,
      allocations: {
        create: allocations.map((a) => ({ expenseEntryId: a.expenseEntryId, amount: a.amount })),
      },
    },
    include: PAYMENT_INCLUDE,
  });

  const [payment] = await prisma.$transaction([createOp, ...expenseOps]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email ?? undefined,
    action: "CREATE",
    resource: "VendorPayment",
    resourceId: payment.id,
    organizationId: orgId ?? undefined,
    after: {
      vendorId, vendorName: vendor.name, paymentDate, amount, paymentMethod,
      reference: reference || null,
      allocations: allocations.map((a) => ({ expenseEntryId: a.expenseEntryId, amount: a.amount })),
    },
  });

  return Response.json(payment, { status: 201 });
}
