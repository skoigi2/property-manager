import { requireManager, requireAuth, getAccessiblePropertyIds, requireManagerWrite, requirePermissionWrite} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { clearHints } from "@/lib/hints";
import { tryAutoAdvance } from "@/lib/case-workflows";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { buildInvoicePaymentOps } from "@/lib/invoice-payment-entries";
import { invoiceLinesTotal, invoiceUtilitiesTotal } from "@/lib/invoice-payment";
import { maybeAutoEmailReceipt } from "@/lib/receipt-email";

export const maxDuration = 30;

const updateSchema = z.object({
  status: z.enum(["DRAFT","SENT","PENDING_VERIFICATION","PAID","OVERDUE","CANCELLED"]).optional(),
  paidAt: z.string().nullable().optional(),
  paidAmount: z.number().nullable().optional(),
  notes: z.string().optional(),
  rentAmount: z.number().min(0).optional(),
  serviceCharge: z.number().min(0).optional(),
  otherCharges: z.number().min(0).optional(),
  depositAmount: z.number().min(0).optional(),
  leaseFee: z.number().min(0).optional(),
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
          id: true, name: true, email: true, phone: true, isTaxExempt: true,
          unit: {
            select: {
              id: true, unitNumber: true, type: true,
              property: { select: { id: true, name: true, address: true, city: true, organizationId: true } },
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
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const { invoice, accessError } = await getInvoiceWithAccess(params.id);
  if (accessError) return accessError;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const {
    paidAt, dueDate, rentAmount, serviceCharge, otherCharges,
    depositAmount, leaseFee, status, ...rest
  } = parsed.data;

  const editsLines = [rentAmount, serviceCharge, otherCharges, depositAmount, leaseFee].some((v) => v !== undefined);
  if (editsLines && invoice!.status === "PAID") {
    return Response.json({ error: "A paid invoice's lines can't be changed — revert it to unpaid first." }, { status: 400 });
  }

  // Un-cancelling is refused when the invoice carried metered utilities: a
  // cancelled invoice releases its readings, which may since have been billed
  // on another invoice - reviving this one would bill them twice.
  if (invoice!.status === "CANCELLED" && status && status !== "CANCELLED" && invoiceUtilitiesTotal(invoice!) > 0) {
    return Response.json(
      { error: "This cancelled invoice carried water / electricity readings, which were released for re-billing. Raise a new invoice instead." },
      { status: 400 },
    );
  }

  const lines = {
    rentAmount: rentAmount ?? invoice!.rentAmount,
    serviceCharge: serviceCharge ?? invoice!.serviceCharge,
    otherCharges: otherCharges ?? invoice!.otherCharges,
    depositAmount: depositAmount ?? invoice!.depositAmount,
    leaseFee: leaseFee ?? invoice!.leaseFee,
    // An applied late fee stays part of the total (managed via /late-fee).
    lateFeeAmount: invoice!.lateFeeAmount,
    // Metered utilities are never edited here - they always equal the
    // attached meter readings (src/lib/utility-readings.ts) - but they are
    // part of the total and of the payment split.
    waterAmount: invoice!.waterAmount,
    electricityAmount: invoice!.electricityAmount,
  };
  if (editsLines && invoiceLinesTotal(lines) <= 0) {
    return Response.json({ error: "An invoice needs at least one line with an amount." }, { status: 400 });
  }
  const newTotal = invoiceLinesTotal(lines);
  const resolvedPaidAt = paidAt !== undefined ? (paidAt ? new Date(paidAt) : null) : invoice!.paidAt;

  // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
  // The "ensure income entry exists" check reads before the transaction; the
  // race window is identical to the prior callback form (pgBouncer doesn't
  // isolate concurrent reads either) but at least the writes are now
  // guaranteed to commit together.
  const willEnsureIncome = (status === "PAID" || invoice!.status === "PAID");
  const existingAgg = willEnsureIncome
    ? await prisma.incomeEntry.aggregate({ where: { invoiceId: params.id }, _sum: { grossAmount: true }, _count: true })
    : null;
  const existingIncome = (existingAgg?._count ?? 0) > 0;
  const existingPaid = Number(existingAgg?._sum.grossAmount ?? 0);
  // Marking PAID over earlier part payments: the remainder must be booked
  // too, or the tail of the invoice (usually the utilities) never reaches
  // the books.
  const markingPaid = status === "PAID" && invoice!.status !== "PAID";
  const settledTotal = parsed.data.paidAmount ?? newTotal;
  const remainder = markingPaid && existingIncome ? Math.round((settledTotal - existingPaid) * 100) / 100 : 0;

  const invoiceUpdate = prisma.invoice.update({
    where: { id: params.id },
    data: {
      ...rest,
      status,
      rentAmount: lines.rentAmount,
      serviceCharge: lines.serviceCharge,
      otherCharges: lines.otherCharges,
      depositAmount: lines.depositAmount,
      leaseFee: lines.leaseFee,
      totalAmount: newTotal,
      ...(remainder > 0.005 && parsed.data.paidAmount == null ? { paidAmount: settledTotal } : {}),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [invoiceUpdate];
  if (willEnsureIncome && !existingIncome) {
    const payDate = resolvedPaidAt ?? invoice!.paidAt ?? new Date();
    const gross = parsed.data.paidAmount ?? invoice!.paidAmount ?? newTotal;
    // One typed IncomeEntry per invoice line (rent side / deposit / fees) —
    // a move-in payment must not read as rent. Tax snapshot per entry.
    const { ops: entryOps } = await buildInvoicePaymentOps({
      invoice: {
        id: invoice!.id,
        invoiceNumber: invoice!.invoiceNumber,
        tenantId: invoice!.tenant.id,
        unitId: invoice!.tenant.unit.id,
        propertyId: invoice!.tenant.unit.property.id,
        organizationId: invoice!.tenant.unit.property.organizationId ?? session!.user.organizationId,
        isTaxExempt: invoice!.tenant.isTaxExempt,
        ...lines,
        alreadyPaid: 0,
      },
      amount: gross,
      date: payDate,
      note: `Auto-created from invoice ${invoice!.invoiceNumber}`,
    });
    ops.push(...entryOps);
  } else if (remainder > 0.005) {
    const { ops: entryOps } = await buildInvoicePaymentOps({
      invoice: {
        id: invoice!.id,
        invoiceNumber: invoice!.invoiceNumber,
        tenantId: invoice!.tenant.id,
        unitId: invoice!.tenant.unit.id,
        propertyId: invoice!.tenant.unit.property.id,
        organizationId: invoice!.tenant.unit.property.organizationId ?? session!.user.organizationId,
        isTaxExempt: invoice!.tenant.isTaxExempt,
        ...lines,
        alreadyPaid: existingPaid,
      },
      amount: remainder,
      date: resolvedPaidAt ?? new Date(),
      note: `Balance settled on invoice ${invoice!.invoiceNumber}`,
    });
    ops.push(...entryOps);
  }
  const txResults = await prisma.$transaction(ops);
  const updated = txResults[0];
  const createdEntries = txResults.slice(1) as { id: string }[];

  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "Invoice", resourceId: params.id, organizationId: session!.user.organizationId, after: { status: updated.status, totalAmount: updated.totalAmount } });

  // Clear INVOICE_OVERDUE hint once invoice is no longer overdue
  if (updated.status === "PAID" || updated.status === "CANCELLED") {
    await clearHints(params.id, "INVOICE_OVERDUE");
  }

  // Auto-advance the linked case to "Invoiced" on PAID transitions
  if (updated.status === "PAID" && (updated as { caseThreadId?: string | null }).caseThreadId) {
    await tryAutoAdvance((updated as { caseThreadId: string }).caseThreadId, { kind: "INVOICE_PAID" });
  }

  // Public-API webhooks — fire-and-forget after the transaction commits
  if (updated.status === "PAID" && invoice!.status !== "PAID") {
    void dispatchWebhookEvent(session!.user.organizationId, "invoice.paid", {
      invoiceId: updated.id,
      invoiceNumber: updated.invoiceNumber,
      totalAmount: updated.totalAmount,
      paidAmount: updated.paidAmount,
      paidAt: updated.paidAt,
      tenantId: updated.tenantId,
    });
  }

  // Receipt to the tenant — one per payment event, when the payment was
  // recorded here (a pre-existing entry already had its receipt).
  let receipt: { sent: boolean; reason?: string } | null = null;
  if (createdEntries.length > 0) {
    receipt = await maybeAutoEmailReceipt(
      createdEntries[0].id,
      invoice!.tenant.unit.property.organizationId ?? session!.user.organizationId,
      invoice!.tenant.unit.property.id,
    );
  }

  return Response.json({ ...updated, receipt, primaryEntryId: createdEntries[0]?.id ?? null });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requirePermissionWrite("FINANCIAL_DELETE");
  if (error) return error;

  const { accessError } = await getInvoiceWithAccess(params.id);
  if (accessError) return accessError;

  await prisma.invoice.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
