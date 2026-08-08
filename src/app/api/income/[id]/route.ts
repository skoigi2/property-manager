import { requireManager, requirePropertyAccess, requireManagerWrite, requirePermissionWrite} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { incomeEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { clearHints } from "@/lib/hints";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { tryAutoAdvance } from "@/lib/case-workflows";
import { z } from "zod";

async function loadEntryPropertyId(id: string): Promise<string | null> {
  const e = await prisma.incomeEntry.findUnique({
    where: { id },
    select: { unit: { select: { propertyId: true } } },
  });
  return e?.unit?.propertyId ?? null;
}

// PATCH — mark commission paid / unpaid, link the entry to a tenant (used by
// the Deposit tab to attach an untagged unit DEPOSIT receipt), OR link the
// entry to one of the tenant's invoices ("allocate" — used by the Income page
// for payments recorded without picking an invoice).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyId = await loadEntryPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = z
    .object({
      commissionPaidAt: z.string().nullable().optional(),
      tenantId: z.string().min(1).optional(),
      invoiceId: z.string().min(1).optional(),
    })
    .safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  if (
    parsed.data.commissionPaidAt === undefined &&
    parsed.data.tenantId === undefined &&
    parsed.data.invoiceId === undefined
  ) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const before = await prisma.incomeEntry.findUnique({
    where: { id: params.id },
    select: {
      commissionPaidAt: true, agentCommission: true, agentName: true,
      tenantId: true, unitId: true, invoiceId: true, grossAmount: true, date: true,
    },
  });

  // Tenant link: only to a tenant on the SAME unit — an untagged deposit must
  // never be attributed across units.
  if (parsed.data.tenantId !== undefined) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: parsed.data.tenantId },
      select: { unitId: true },
    });
    if (!tenant || tenant.unitId !== before?.unitId) {
      return Response.json({ error: "Tenant not found on this entry's unit" }, { status: 400 });
    }
  }

  // Invoice link: only to an invoice of the entry's OWN tenant, never a
  // cancelled one, and only when the entry isn't already allocated.
  let invoice:
    | { id: string; invoiceNumber: string; totalAmount: number; paidAmount: number | null; status: string; caseThreadId: string | null }
    | null = null;
  if (parsed.data.invoiceId !== undefined) {
    if (before?.invoiceId) {
      return Response.json({ error: "This payment is already allocated to an invoice" }, { status: 409 });
    }
    const effectiveTenantId = parsed.data.tenantId ?? before?.tenantId;
    if (!effectiveTenantId) {
      return Response.json({ error: "Attribute the payment to a tenant before allocating it to an invoice" }, { status: 400 });
    }
    invoice = await prisma.invoice.findUnique({
      where: { id: parsed.data.invoiceId },
      select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, status: true, caseThreadId: true, tenantId: true },
    }).then((inv) => (inv && inv.tenantId === effectiveTenantId ? inv : null));
    if (!invoice) {
      return Response.json({ error: "Invoice not found for this tenant" }, { status: 400 });
    }
    if (invoice.status === "CANCELLED") {
      return Response.json({ error: "Cannot allocate a payment to a cancelled invoice" }, { status: 400 });
    }
  }

  // Settle parity with POST /api/income: allocating a payment that covers the
  // invoice flips it to PAID and fires the same follow-through (hints, case
  // auto-advance, webhook).
  const newPaidTotal = invoice ? (invoice.paidAmount ?? 0) + (before?.grossAmount ?? 0) : 0;
  const becomesPaid = !!invoice && invoice.status !== "PAID" && newPaidTotal >= invoice.totalAmount * 0.99;

  const entryData = {
    ...(parsed.data.commissionPaidAt !== undefined
      ? { commissionPaidAt: parsed.data.commissionPaidAt ? new Date(parsed.data.commissionPaidAt) : null }
      : {}),
    ...(parsed.data.tenantId !== undefined ? { tenantId: parsed.data.tenantId } : {}),
    ...(invoice ? { invoiceId: invoice.id } : {}),
  };

  let entry;
  if (invoice && invoice.status !== "PAID") {
    const [updatedEntry] = await prisma.$transaction([
      prisma.incomeEntry.update({ where: { id: params.id }, data: entryData }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: becomesPaid
          ? { status: "PAID", paidAt: before?.date ?? new Date(), paidAmount: newPaidTotal }
          : { paidAmount: newPaidTotal },
      }),
    ]);
    entry = updatedEntry;
  } else {
    entry = await prisma.incomeEntry.update({ where: { id: params.id }, data: entryData });
  }

  if (becomesPaid && invoice) {
    await clearHints(invoice.id, "INVOICE_OVERDUE");
    if (invoice.caseThreadId) {
      await tryAutoAdvance(invoice.caseThreadId, { kind: "INVOICE_PAID" });
    }
    void dispatchWebhookEvent(session!.user.organizationId, "invoice.paid", {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      paidAmount: newPaidTotal,
      paidAt: before?.date ?? new Date(),
      tenantId: entry.tenantId,
    });
  }

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email,
    action:    "UPDATE",
    resource:  "IncomeEntry",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before: { commissionPaidAt: before?.commissionPaidAt ?? null, tenantId: before?.tenantId ?? null, invoiceId: before?.invoiceId ?? null },
    after:  { commissionPaidAt: entry.commissionPaidAt, tenantId: entry.tenantId, invoiceId: entry.invoiceId },
  });

  return Response.json(entry);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyId = await loadEntryPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = incomeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, ...rest } = parsed.data;

  const before = await prisma.incomeEntry.findUnique({ where: { id: params.id }, select: { grossAmount: true, type: true, date: true } });

  const entry = await prisma.incomeEntry.update({
    where: { id: params.id },
    data: {
      ...rest,
      date: new Date(date),
      checkIn: checkIn ? new Date(checkIn) : null,
      checkOut: checkOut ? new Date(checkOut) : null,
    },
    include: { unit: { include: { property: { select: { name: true } } } } },
  });

  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "IncomeEntry", resourceId: params.id, organizationId: session!.user.organizationId, before, after: { type: entry.type, grossAmount: entry.grossAmount, date: entry.date } });

  return Response.json(entry);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requirePermissionWrite("FINANCIAL_DELETE");
  if (error) return error;

  const propertyId = await loadEntryPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const before = await prisma.incomeEntry.findUnique({ where: { id: params.id }, select: { grossAmount: true, type: true, date: true } });
  await prisma.incomeEntry.delete({ where: { id: params.id } });
  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "DELETE", resource: "IncomeEntry", resourceId: params.id, organizationId: session!.user.organizationId, before });
  return Response.json({ success: true });
}
