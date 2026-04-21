import { requireManager, requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ownerInvoiceUpdateSchema, type OwnerInvoiceLineItem } from "@/lib/validations";

async function getInvoiceWithAccess(id: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { invoice: null, accessError: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const invoice = await prisma.ownerInvoice.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, name: true, address: true, city: true } },
      owner:    { select: { id: true, name: true, email: true, phone: true } },
    },
  });
  if (!invoice) return { invoice: null, accessError: Response.json({ error: "Not found" }, { status: 404 }) };
  if (!propertyIds.includes(invoice.propertyId)) {
    return { invoice: null, accessError: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { invoice, accessError: null };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const { invoice, accessError } = await getInvoiceWithAccess(params.id);
  if (accessError) return accessError;

  return Response.json(invoice);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const { invoice, accessError } = await getInvoiceWithAccess(params.id);
  if (accessError) return accessError;

  const body = await req.json();
  const parsed = ownerInvoiceUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { status, paidAt, paidAmount, notes, dueDate, lineItems } = parsed.data;

  const resolvedLineItems = lineItems ?? (invoice!.lineItems as OwnerInvoiceLineItem[]);
  const newTotal = resolvedLineItems.reduce((s, i) => s + i.amount, 0);
  const resolvedPaidAt = paidAt !== undefined ? (paidAt ? new Date(paidAt) : null) : invoice!.paidAt;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedInvoice = await tx.ownerInvoice.update({
      where: { id: params.id },
      data: {
        ...(status     ? { status }                         : {}),
        ...(paidAmount !== undefined ? { paidAmount }       : {}),
        ...(notes      !== undefined ? { notes }            : {}),
        ...(dueDate    ? { dueDate: new Date(dueDate) }     : {}),
        ...(lineItems  ? { lineItems: lineItems as never, totalAmount: newTotal } : {}),
        ...(paidAt !== undefined ? { paidAt: resolvedPaidAt } : {}),
      },
      include: {
        property: { select: { id: true, name: true } },
      },
    });

    // When status is PAID, auto-create income entries — idempotent
    if (status === "PAID" || updatedInvoice.status === "PAID") {
      const existing = await tx.incomeEntry.findFirst({
        where: { ownerInvoiceId: params.id },
      });
      if (!existing) {
        const payDate = resolvedPaidAt ?? new Date();
        const items = updatedInvoice.lineItems as OwnerInvoiceLineItem[];

        // Fallback unit for line items without a unitId
        const fallbackUnit = await tx.unit.findFirst({
          where: { propertyId: updatedInvoice.propertyId },
          select: { id: true },
        });

        for (const item of items) {
          const resolvedUnitId = item.unitId ?? fallbackUnit?.id;
          if (!resolvedUnitId) continue;

          await tx.incomeEntry.create({
            data: {
              date:           payDate,
              unitId:         resolvedUnitId,
              tenantId:       item.tenantId ?? null,
              ownerInvoiceId: params.id,
              type:           item.incomeType,
              grossAmount:    item.amount,
              agentCommission: 0,
              note: `Auto-created from owner invoice ${updatedInvoice.invoiceNumber}`,
            },
          });
        }
      }
    }

    return updatedInvoice;
  });

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email,
    action:    "UPDATE",
    resource:  "OwnerInvoice",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    after: { status: updated.status, totalAmount: updated.totalAmount },
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const { invoice, accessError } = await getInvoiceWithAccess(params.id);
  if (accessError) return accessError;

  if (invoice!.status === "PAID") {
    return Response.json({ error: "Cannot delete a paid invoice" }, { status: 409 });
  }

  await prisma.ownerInvoice.delete({ where: { id: params.id } });

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email,
    action:    "DELETE",
    resource:  "OwnerInvoice",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
  });

  return new Response(null, { status: 204 });
}
