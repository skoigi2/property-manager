export const maxDuration = 60;

import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { clearHints } from "@/lib/hints";
import { tryAutoAdvance } from "@/lib/case-workflows";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { buildInvoicePaymentOps } from "@/lib/invoice-payment-entries";
import { maybeAutoEmailReceipt } from "@/lib/receipt-email";

const MAX_BATCH = 100;

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BATCH),
  /** Payment date applied to every invoice (default: now). */
  paidAt: z.string().optional(),
});

// ── POST /api/invoices/bulk-mark-paid ────────────────────────────────────────
// Marks each selected invoice PAID with the same side effects as the single
// PATCH: paidAmount defaults to the invoice total, typed IncomeEntry rows are
// created when none exist (rent side / deposit / fees), overdue hints clear,
// linked cases auto-advance, the invoice.paid webhook fires and the tenant is
// emailed a receipt. Already-paid/cancelled rows are skipped.
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: parsed.data.ids } },
    select: {
      id: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true,
      rentAmount: true, serviceCharge: true, otherCharges: true, lateFeeAmount: true,
      waterAmount: true, electricityAmount: true,
      depositAmount: true, leaseFee: true,
      caseThreadId: true, tenantId: true,
      tenant: { select: { id: true, name: true, isTaxExempt: true, unit: { select: { id: true, propertyId: true, property: { select: { organizationId: true } } } } } },
    },
  });

  const paid: { id: string; invoiceNumber: string }[] = [];
  const skipped: { id: string; invoiceNumber: string; reason: string }[] = [];
  const failed: { id: string; invoiceNumber: string; error: string }[] = [];
  const receipts: { entryId: string; orgId: string | null; propertyId: string }[] = [];

  for (const inv of invoices) {
    if (!propertyIds.includes(inv.tenant.unit.propertyId)) {
      skipped.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, reason: "No access" });
      continue;
    }
    if (inv.status === "PAID" || inv.status === "CANCELLED") {
      skipped.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, reason: `Already ${inv.status.toLowerCase()}` });
      continue;
    }

    try {
      const existingAgg = await prisma.incomeEntry.aggregate({
        where: { invoiceId: inv.id },
        _sum: { grossAmount: true },
        _count: true,
      });
      const existingIncome = existingAgg._count > 0;
      const existingPaid = Number(existingAgg._sum.grossAmount ?? 0);
      // Part payments already booked: marking PAID settles the rest, so the
      // unpaid tail (usually the utilities) is booked too.
      const remainder = existingIncome ? Math.round((inv.totalAmount - existingPaid) * 100) / 100 : 0;
      const lines = {
        rentAmount: inv.rentAmount,
        serviceCharge: inv.serviceCharge,
        otherCharges: inv.otherCharges,
        lateFeeAmount: inv.lateFeeAmount,
        waterAmount: inv.waterAmount,
        electricityAmount: inv.electricityAmount,
        depositAmount: inv.depositAmount,
        leaseFee: inv.leaseFee,
      };
      const orgId = inv.tenant.unit.property.organizationId ?? session!.user.organizationId;

      // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops: any[] = [
        prisma.invoice.update({
          where: { id: inv.id },
          data: {
            status: "PAID",
            paidAt,
            paidAmount: remainder > 0.005 ? inv.totalAmount : inv.paidAmount ?? inv.totalAmount,
          },
        }),
      ];
      if (!existingIncome) {
        const { ops: entryOps } = await buildInvoicePaymentOps({
          invoice: {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            tenantId: inv.tenant.id,
            unitId: inv.tenant.unit.id,
            propertyId: inv.tenant.unit.propertyId,
            organizationId: orgId,
            isTaxExempt: inv.tenant.isTaxExempt,
            ...lines,
            alreadyPaid: 0,
          },
          amount: inv.paidAmount ?? inv.totalAmount,
          date: paidAt,
          note: `Auto-created from invoice ${inv.invoiceNumber}`,
        });
        ops.push(...entryOps);
      } else if (remainder > 0.005) {
        const { ops: entryOps } = await buildInvoicePaymentOps({
          invoice: {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            tenantId: inv.tenant.id,
            unitId: inv.tenant.unit.id,
            propertyId: inv.tenant.unit.propertyId,
            organizationId: orgId,
            isTaxExempt: inv.tenant.isTaxExempt,
            ...lines,
            alreadyPaid: existingPaid,
          },
          amount: remainder,
          date: paidAt,
          note: `Balance settled on invoice ${inv.invoiceNumber}`,
        });
        ops.push(...entryOps);
      }
      const results = await prisma.$transaction(ops);
      const created = results.slice(1) as { id: string }[];
      if (created[0]) receipts.push({ entryId: created[0].id, orgId, propertyId: inv.tenant.unit.propertyId });

      await clearHints(inv.id, "INVOICE_OVERDUE");
      if (inv.caseThreadId) {
        await tryAutoAdvance(inv.caseThreadId, { kind: "INVOICE_PAID" });
      }
      void dispatchWebhookEvent(session!.user.organizationId, "invoice.paid", {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount ?? inv.totalAmount,
        paidAt,
        tenantId: inv.tenantId,
      });

      paid.push({ id: inv.id, invoiceNumber: inv.invoiceNumber });
    } catch (e) {
      failed.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        error: e instanceof Error ? e.message : "Update failed",
      });
    }
  }

  // Receipts after the bookkeeping, a few at a time (PDF render + send each).
  let receiptsSent = 0;
  for (let i = 0; i < receipts.length; i += 5) {
    const batch = receipts.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.map((r) => maybeAutoEmailReceipt(r.entryId, r.orgId, r.propertyId)),
    );
    receiptsSent += settled.filter((s) => s.status === "fulfilled" && s.value.sent).length;
  }

  if (paid.length > 0) {
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "Invoice",
      resourceId: paid.map((p) => p.invoiceNumber).join(", ").slice(0, 190),
      organizationId: session!.user.organizationId,
      after: { bulkMarkPaid: paid.length, paidAt, receiptsSent },
    });
  }

  return Response.json({
    paid: paid.length,
    skipped: skipped.length,
    failed: failed.length,
    receiptsSent,
    paidDetails: paid,
    skippedDetails: skipped,
    failedDetails: failed,
  });
}
