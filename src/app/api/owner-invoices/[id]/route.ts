import { requireManager, requireAuth, getAccessiblePropertyIds, requireManagerWrite, requirePermissionWrite} from "@/lib/auth-utils";
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
  const { session, error } = await requireManagerWrite();
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

  // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
  // Pre-read the data we need to plan ops (existence check + fallback unit).
  const willEnsureIncome = (status === "PAID" || invoice!.status === "PAID");
  const [existingIncome, fallbackUnit] = willEnsureIncome
    ? await Promise.all([
        prisma.incomeEntry.findFirst({ where: { ownerInvoiceId: params.id } }),
        prisma.unit.findFirst({ where: { propertyId: invoice!.propertyId }, select: { id: true } }),
      ])
    : [null, null];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [
    prisma.ownerInvoice.update({
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
    }),
  ];

  if (willEnsureIncome && !existingIncome) {
    const payDate = resolvedPaidAt ?? new Date();
    for (const item of resolvedLineItems) {
      const resolvedUnitId = item.unitId ?? fallbackUnit?.id;
      if (!resolvedUnitId) continue;
      ops.push(prisma.incomeEntry.create({
        data: {
          date:           payDate,
          unitId:         resolvedUnitId,
          tenantId:       item.tenantId ?? null,
          ownerInvoiceId: params.id,
          type:           item.incomeType,
          grossAmount:    item.amount,
          agentCommission: 0,
          note: `Auto-created from owner invoice ${invoice!.invoiceNumber}`,
        },
      }));
    }
  }
  const txResults = await prisma.$transaction(ops);
  const updated = txResults[0];

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
  const { session, error } = await requirePermissionWrite("FINANCIAL_DELETE");
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
