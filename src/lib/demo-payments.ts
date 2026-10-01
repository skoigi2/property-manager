import type { PaymentMethod, Prisma } from "@prisma/client";
import { allocateInvoicePayment, type InvoiceLinesLike } from "@/lib/invoice-payment";

/**
 * Receipts for a payment against a seeded invoice, split by the same
 * allocator real payments go through (allocateInvoicePayment: rent side →
 * water → electricity → deposit → lease fee). Demo seeds derive their income
 * rows from the stored invoice through this instead of computing amounts by
 * hand, so the receipts can't drift from the invoice (the Belsize seed booked
 * rent only against rent + service charge invoices for months).
 *
 * The seeds still set their own tax snapshot / commission (`rentFields`, on
 * the rent-side row only): they model a specific tax story the live engine
 * over the seeded configs would not reproduce.
 */
export interface DemoInvoice extends InvoiceLinesLike {
  id: string;
  tenantId: string;
  totalAmount: number;
  paidAmount?: number | null;
}

export interface DemoPaymentOptions {
  unitId: string;
  date: Date;
  /** Defaults to what is still unpaid of the invoice's paid amount (paidAmount, else total) after `alreadyPaid`. */
  amount?: number;
  /** Payments already booked against the invoice. */
  alreadyPaid?: number;
  paymentMethod?: PaymentMethod | null;
  note?: string | null;
  /** Extra fields for the rent-side (LONGTERM_RENT) row only. */
  rentFields?: Partial<Prisma.IncomeEntryCreateManyInput>;
}

export function demoPaymentRows(invoice: DemoInvoice, opts: DemoPaymentOptions): Prisma.IncomeEntryCreateManyInput[] {
  const alreadyPaid = opts.alreadyPaid ?? 0;
  const amount = opts.amount ?? Math.round(((invoice.paidAmount ?? invoice.totalAmount) - alreadyPaid) * 100) / 100;
  return allocateInvoicePayment(invoice, amount, alreadyPaid).map((part) => ({
    date: opts.date,
    unitId: opts.unitId,
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    type: part.type,
    utilityType: part.utility ?? null,
    grossAmount: part.amount,
    agentCommission: 0,
    paymentMethod: opts.paymentMethod ?? null,
    note: opts.note ?? null,
    ...(part.type === "LONGTERM_RENT" ? opts.rentFields : {}),
  }));
}
