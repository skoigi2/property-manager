import { requireManager, requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { clearHints } from "@/lib/hints";
import { tryAutoAdvance } from "@/lib/case-workflows";

const updateSchema = z.object({
  status: z.enum(["DRAFT","SENT","PAID","OVERDUE","CANCELLED"]).optional(),
  paidAt: z.string().nullable().optional(),
  paidAmount: z.number().nullable().optional(),
  notes: z.string().optional(),
  rentAmount: z.number().min(0).optional(),
  serviceCharge: z.number().min(0).optional(),
  otherCharges: z.number().min(0).optional(),
  dueDate: z.string().optional(),
});

async function getInvoiceWithAccess(id: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { invoice: null, accessError: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      tenant: {
        select: {
          id: true, name: true, email: true, phone: true,
          unit: {
            select: {
              id: true, unitNumber: true, type: true,
              property: { select: { id: true, name: true, address: true, city: true } },
            },
          },
        },
      },
    },
  });
  if (!invoice) return { invoice: null, accessError: Response.json({ error: "Not found" }, { status: 404 }) };
  if (!propertyIds.includes(invoice.tenant.unit.property.id)) {
    return { invoice: null, accessError: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { invoice, accessError: null };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
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
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { paidAt, dueDate, rentAmount, serviceCharge, otherCharges, status, ...rest } = parsed.data;

  const newRent = rentAmount ?? invoice!.rentAmount;
  const newService = serviceCharge ?? invoice!.serviceCharge;
  const newOther = otherCharges ?? invoice!.otherCharges;
  const newTotal = newRent + newService + newOther;
  const resolvedPaidAt = paidAt !== undefined ? (paidAt ? new Date(paidAt) : null) : invoice!.paidAt;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedInvoice = await tx.invoice.update({
      where: { id: params.id },
      data: {
        ...rest,
        status,
        rentAmount: newRent,
        serviceCharge: newService,
        otherCharges: newOther,
        totalAmount: newTotal,
        ...(paidAt !== undefined ? { paidAt: resolvedPaidAt } : {}),
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
      },
      include: {
        tenant: {
          select: {
            id: true, name: true, email: true, phone: true,
            unit: {
              select: {
                id: true, unitNumber: true, type: true,
                property: { select: { id: true, name: true, address: true, city: true } },
              },
            },
          },
        },
      },
    });

    // When status is PAID (new or already), ensure an income entry exists — idempotent
    if (status === "PAID" || updatedInvoice.status === "PAID") {
      const existing = await tx.incomeEntry.findFirst({
        where: { invoiceId: params.id },
      });
      if (!existing) {
        const payDate = resolvedPaidAt ?? updatedInvoice.paidAt ?? new Date();
        await tx.incomeEntry.create({
          data: {
            date: payDate,
            unitId: updatedInvoice.tenant.unit.id,
            tenantId: updatedInvoice.tenant.id,
            invoiceId: params.id,
            type: "LONGTERM_RENT",
            grossAmount: parsed.data.paidAmount ?? updatedInvoice.paidAmount ?? newTotal,
            agentCommission: 0,
            note: `Auto-created from invoice ${updatedInvoice.invoiceNumber}`,
          },
        });
      }
    }

    return updatedInvoice;
  });

  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "Invoice", resourceId: params.id, organizationId: session!.user.organizationId, after: { status: updated.status, totalAmount: updated.totalAmount } });

  // Clear INVOICE_OVERDUE hint once invoice is no longer overdue
  if (updated.status === "PAID" || updated.status === "CANCELLED") {
    await clearHints(params.id, "INVOICE_OVERDUE");
  }

  // Auto-advance the linked case to "Invoiced" on PAID transitions
  if (updated.status === "PAID" && (updated as { caseThreadId?: string | null }).caseThreadId) {
    await tryAutoAdvance((updated as { caseThreadId: string }).caseThreadId, { kind: "INVOICE_PAID" });
  }

  return Response.json(updated);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { accessError } = await getInvoiceWithAccess(params.id);
  if (accessError) return accessError;

  await prisma.invoice.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
