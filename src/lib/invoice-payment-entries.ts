import "server-only";
import { prisma } from "@/lib/prisma";
import { getActiveTaxConfigs, matchConfig, buildTaxSnapshot } from "@/lib/tax-engine";
import { allocateInvoicePayment, type InvoiceLinesLike, type PaymentAllocation } from "@/lib/invoice-payment";

// Prisma side of src/lib/invoice-payment.ts: turn a payment against an
// invoice into typed IncomeEntry create operations for the caller's
// array-form $transaction (callback-form is pgBouncer-incompatible).
//
// Every site that books money against an invoice goes through here —
// PATCH /api/invoices/[id], bulk-mark-paid, verify-proof, reconcile/confirm
// and POST /api/income — so a move-in invoice always splits the same way.

export interface InvoicePaymentTarget extends InvoiceLinesLike {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  organizationId: string | null | undefined;
  isTaxExempt?: boolean | null;
  /** Sum of payments already booked against the invoice (before this one). */
  alreadyPaid: number;
}

export interface InvoicePaymentInput {
  invoice: InvoicePaymentTarget;
  amount: number;
  date: Date;
  paymentMethod?: string | null;
  /** Free-text note for every created row (bank ref, "Auto-created from invoice …"). */
  note: string;
}

export async function buildInvoicePaymentOps(input: InvoicePaymentInput): Promise<{
  parts: PaymentAllocation[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ops: any[];
}> {
  const { invoice, amount, date, paymentMethod, note } = input;
  const parts = allocateInvoicePayment(invoice, amount, invoice.alreadyPaid);

  // Tax snapshot per entry type (rate as of the receipt date; stored
  // absolute, never recomputed on read) — parity with POST /api/income.
  const configs =
    invoice.propertyId && invoice.organizationId && !invoice.isTaxExempt
      ? await getActiveTaxConfigs(invoice.propertyId, invoice.organizationId, date)
      : [];

  const ops = parts.map((p) =>
    prisma.incomeEntry.create({
      data: {
        date,
        unitId: invoice.unitId,
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        type: p.type,
        utilityType: p.utility ?? null,
        grossAmount: p.amount,
        agentCommission: 0,
        paymentMethod: (paymentMethod as never) ?? null,
        note,
        ...buildTaxSnapshot(p.amount, configs.length ? matchConfig(configs, p.type) : null),
      },
      select: { id: true, type: true, grossAmount: true },
    }),
  );

  return { parts, ops };
}
