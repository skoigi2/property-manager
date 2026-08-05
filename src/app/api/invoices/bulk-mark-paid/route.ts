export const maxDuration = 60;

import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { clearHints } from "@/lib/hints";
import { tryAutoAdvance } from "@/lib/case-workflows";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { snapshotRentTax } from "@/lib/tax-engine";

const MAX_BATCH = 100;

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BATCH),
  /** Payment date applied to every invoice (default: now). */
  paidAt: z.string().optional(),
});

// ── POST /api/invoices/bulk-mark-paid ────────────────────────────────────────
// Marks each selected invoice PAID with the same side effects as the single
// PATCH: paidAmount defaults to the invoice total, a matching IncomeEntry is
// created when none exists, overdue hints clear, linked cases auto-advance,
// and the invoice.paid webhook fires. Already-paid/cancelled rows are skipped.
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
      caseThreadId: true, tenantId: true,
      tenant: { select: { id: true, name: true, isTaxExempt: true, unit: { select: { id: true, propertyId: true, property: { select: { organizationId: true } } } } } },
    },
  });

  const paid: { id: string; invoiceNumber: string }[] = [];
  const skipped: { id: string; invoiceNumber: string; reason: string }[] = [];
  const failed: { id: string; invoiceNumber: string; error: string }[] = [];

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
      const existingIncome = await prisma.incomeEntry.findFirst({
        where: { invoiceId: inv.id },
        select: { id: true },
      });

      // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops: any[] = [
        prisma.invoice.update({
          where: { id: inv.id },
          data: { status: "PAID", paidAt, paidAmount: inv.paidAmount ?? inv.totalAmount },
        }),
      ];
      if (!existingIncome) {
        // Tax snapshot — parity with the single PATCH / POST /api/income.
        const taxSnapshot = await snapshotRentTax({
          propertyId: inv.tenant.unit.propertyId,
          orgId: inv.tenant.unit.property.organizationId ?? session!.user.organizationId,
          isTaxExempt: inv.tenant.isTaxExempt,
          amount: inv.paidAmount ?? inv.totalAmount,
          date: paidAt,
        });
        ops.push(prisma.incomeEntry.create({
          data: {
            date: paidAt,
            unitId: inv.tenant.unit.id,
            tenantId: inv.tenant.id,
            invoiceId: inv.id,
            type: "LONGTERM_RENT",
            grossAmount: inv.paidAmount ?? inv.totalAmount,
            agentCommission: 0,
            note: `Auto-created from invoice ${inv.invoiceNumber}`,
            ...taxSnapshot,
          },
        }));
      }
      await prisma.$transaction(ops);

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

  if (paid.length > 0) {
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "Invoice",
      resourceId: paid.map((p) => p.invoiceNumber).join(", ").slice(0, 190),
      organizationId: session!.user.organizationId,
      after: { bulkMarkPaid: paid.length, paidAt },
    });
  }

  return Response.json({
    paid: paid.length,
    skipped: skipped.length,
    failed: failed.length,
    paidDetails: paid,
    skippedDetails: skipped,
    failedDetails: failed,
  });
}
