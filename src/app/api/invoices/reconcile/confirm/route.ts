export const maxDuration = 60;

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { clearHints } from "@/lib/hints";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { tryAutoAdvance } from "@/lib/case-workflows";
import { getActiveTaxConfigs, matchConfig, buildTaxSnapshot } from "@/lib/tax-engine";

/**
 * POST /api/invoices/reconcile/confirm — apply confirmed statement matches.
 *
 * Each match creates a LONGTERM_RENT income entry linked to the invoice and
 * accumulates the invoice's paidAmount, flipping it to PAID only when
 * effectively fully paid — full parity with POST /api/income (hints cleared,
 * case auto-advance, invoice.paid webhook, tax snapshot). Per-match failures
 * are reported without aborting the batch.
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

  for (const m of parsed.data.matches) {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: m.invoiceId },
        select: {
          id: true, invoiceNumber: true, totalAmount: true, paidAmount: true,
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

      // Tax snapshot — parity with POST /api/income.
      const propertyId = invoice.tenant.unit.propertyId;
      const orgId = invoice.tenant.unit.property.organizationId ?? session!.user.organizationId ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let taxSnapshot: any = { taxConfigId: null, taxRate: null, taxAmount: null, taxType: null };
      if (propertyId && orgId && !invoice.tenant.isTaxExempt) {
        const configs = await getActiveTaxConfigs(propertyId, orgId, new Date(m.date));
        taxSnapshot = buildTaxSnapshot(m.amount, matchConfig(configs, "LONGTERM_RENT"));
      }

      const prevPaid = invoice.paidAmount ?? 0;
      const newPaidTotal = prevPaid + m.amount;
      const becomesPaid = newPaidTotal >= invoice.totalAmount * 0.99;
      const paidDate = new Date(m.date);

      const [entry] = await prisma.$transaction([
        prisma.incomeEntry.create({
          data: {
            unitId: invoice.tenant.unitId,
            tenantId: invoice.tenantId,
            invoiceId: invoice.id,
            type: "LONGTERM_RENT",
            grossAmount: m.amount,
            agentCommission: 0,
            date: paidDate,
            paymentMethod: m.method ?? "BANK_TRANSFER",
            note: m.reference
              ? `Statement reconciliation — ref ${m.reference}`
              : "Statement reconciliation",
            ...taxSnapshot,
          },
        }),
        prisma.invoice.update({
          where: { id: invoice.id },
          data: becomesPaid
            ? { status: "PAID", paidAt: paidDate, paidAmount: newPaidTotal }
            : { paidAmount: newPaidTotal },
        }),
      ]);

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
        after: { type: "LONGTERM_RENT", grossAmount: m.amount, date: paidDate, source: "statement-reconciliation", invoiceId: invoice.id },
      });

      applied.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: m.amount, nowPaid: becomesPaid });
    } catch (e) {
      failed.push({ invoiceId: m.invoiceId, error: e instanceof Error ? e.message : "Failed to apply" });
    }
  }

  return NextResponse.json({ applied, failed });
}
