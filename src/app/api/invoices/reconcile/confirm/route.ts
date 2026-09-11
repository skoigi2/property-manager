export const maxDuration = 60;

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { clearHints } from "@/lib/hints";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { tryAutoAdvance } from "@/lib/case-workflows";
import { buildInvoicePaymentOps } from "@/lib/invoice-payment-entries";
import { maybeAutoEmailReceipt } from "@/lib/receipt-email";

/**
 * POST /api/invoices/reconcile/confirm — apply confirmed statement matches.
 *
 * Each match books typed income entries against the invoice (rent side /
 * deposit / fees via the shared allocator) and accumulates the invoice's
 * paidAmount, flipping it to PAID only when effectively fully paid — full
 * parity with POST /api/income (hints cleared, case auto-advance, invoice.paid
 * webhook, tax snapshot, tenant receipt). Per-match failures are reported
 * without aborting the batch.
 */

const matchSchema = z.object({
  invoiceId:  z.string().min(1),
  amount:     z.number().positive(),
  date:       z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
  reference:  z.string().max(120).optional().nullable(),
  method:     z.enum(["BANK_TRANSFER", "MPESA", "CASH", "CARD", "CHEQUE", "OTHER"]).optional().nullable(),
});

const confirmSchema = z.object({
  matches: z.array(matchSchema).min(1).max(200),
});

export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid matches" }, { status: 400 });
  }

  const applied: { invoiceId: string; invoiceNumber: string; amount: number; nowPaid: boolean }[] = [];
  const failed: { invoiceId: string; error: string }[] = [];
  const receipts: { entryId: string; orgId: string | null; propertyId: string }[] = [];

  for (const m of parsed.data.matches) {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: m.invoiceId },
        select: {
          id: true, invoiceNumber: true, totalAmount: true, paidAmount: true,
          rentAmount: true, serviceCharge: true, otherCharges: true, lateFeeAmount: true,
          depositAmount: true, leaseFee: true,
          status: true, caseThreadId: true, tenantId: true,
          tenant: {
            select: {
              id: true, unitId: true, isTaxExempt: true,
              unit: { select: { propertyId: true, property: { select: { organizationId: true } } } },
            },
          },
        },
      });
      if (!invoice || !propertyIds.includes(invoice.tenant.unit.propertyId)) {
        failed.push({ invoiceId: m.invoiceId, error: "Invoice not found" });
        continue;
      }
      if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
        failed.push({ invoiceId: m.invoiceId, error: `Invoice is already ${invoice.status.toLowerCase()}` });
        continue;
      }

      const orgId = invoice.tenant.unit.property.organizationId ?? session!.user.organizationId;
      const prevPaid = invoice.paidAmount ?? 0;
      const newPaidTotal = prevPaid + m.amount;
      const becomesPaid = newPaidTotal >= invoice.totalAmount * 0.99;
      const paidDate = new Date(m.date);

      const { ops: entryOps, parts } = await buildInvoicePaymentOps({
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          tenantId: invoice.tenantId,
          unitId: invoice.tenant.unitId,
          propertyId: invoice.tenant.unit.propertyId,
          organizationId: orgId,
          isTaxExempt: invoice.tenant.isTaxExempt,
          rentAmount: invoice.rentAmount,
          serviceCharge: invoice.serviceCharge,
          otherCharges: invoice.otherCharges,
          lateFeeAmount: invoice.lateFeeAmount,
          depositAmount: invoice.depositAmount,
          leaseFee: invoice.leaseFee,
          alreadyPaid: prevPaid,
        },
        amount: m.amount,
        date: paidDate,
        paymentMethod: m.method ?? "BANK_TRANSFER",
        note: m.reference
          ? `Statement reconciliation — ref ${m.reference}`
          : "Statement reconciliation",
      });

      const results = await prisma.$transaction([
        ...entryOps,
        prisma.invoice.update({
          where: { id: invoice.id },
          data: becomesPaid
            ? { status: "PAID", paidAt: paidDate, paidAmount: newPaidTotal }
            : { paidAmount: newPaidTotal },
        }),
      ]);
      const entry = results[0] as { id: string };
      receipts.push({ entryId: entry.id, orgId, propertyId: invoice.tenant.unit.propertyId });

      if (becomesPaid) {
        await clearHints(invoice.id, "INVOICE_OVERDUE");
        if (invoice.caseThreadId) {
          await tryAutoAdvance(invoice.caseThreadId, { kind: "INVOICE_PAID" });
        }
        void dispatchWebhookEvent(session!.user.organizationId, "invoice.paid", {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          paidAmount: newPaidTotal,
          paidAt: paidDate,
          tenantId: invoice.tenantId,
        });
      }

      await logAudit({
        userId: session!.user.id,
        userEmail: session!.user.email,
        action: "CREATE",
        resource: "IncomeEntry",
        resourceId: entry.id,
        organizationId: session!.user.organizationId,
        after: { allocation: parts, grossAmount: m.amount, date: paidDate, source: "statement-reconciliation", invoiceId: invoice.id },
      });

      applied.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: m.amount, nowPaid: becomesPaid });
    } catch (e) {
      failed.push({ invoiceId: m.invoiceId, error: e instanceof Error ? e.message : "Failed to apply" });
    }
  }

  let receiptsSent = 0;
  for (let i = 0; i < receipts.length; i += 5) {
    const settled = await Promise.allSettled(
      receipts.slice(i, i + 5).map((r) => maybeAutoEmailReceipt(r.entryId, r.orgId, r.propertyId)),
    );
    receiptsSent += settled.filter((s) => s.status === "fulfilled" && s.value.sent).length;
  }

  return NextResponse.json({ applied, failed, receiptsSent });
}
