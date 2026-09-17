import "server-only";
import { prisma } from "@/lib/prisma";
import type { ReceiptData } from "@/lib/receipt-pdf";
import { calcDepositPosition } from "@/lib/deposit";
import {
  receiptDescription,
  receiptGroupKey,
  receiptLines,
  receiptNumberFor,
  receiptPrimary,
  receiptStamp,
} from "@/lib/payment-receipt";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Assemble the receipt for the payment event that `entryId` belongs to.
 * Mirrors buildInvoicePdfPayload: callers do their own auth using the
 * returned propertyId / tenantId. Returns null when the entry does not exist
 * or has no tenant (a receipt is always addressed to a tenant).
 *
 * Shared by the portal receipt route, the manager download route and the
 * receipt email — the three must never drift.
 */
export async function loadPaymentReceipt(entryId: string) {
  const entry = await prisma.incomeEntry.findUnique({
    where: { id: entryId },
    include: {
      tenant: { select: { id: true, name: true, email: true, phone: true, depositAmount: true } },
      unit: {
        select: {
          unitNumber: true,
          property: {
            select: {
              id: true, name: true, address: true, city: true, logoUrl: true, currency: true, organizationId: true,
              organization: { select: { name: true, logoUrl: true, address: true, phone: true, email: true } },
            },
          },
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, periodYear: true, periodMonth: true, totalAmount: true } },
    },
  });
  if (!entry || !entry.tenant) return null;

  // The payment event: every entry against the same invoice on the same
  // calendar day (a move-in payment lands as rent + deposit + fee rows).
  const dayStart = new Date(entry.date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(entry.date); dayEnd.setHours(23, 59, 59, 999);
  const group = entry.invoiceId
    ? await prisma.incomeEntry.findMany({
        where: { invoiceId: entry.invoiceId, date: { gte: dayStart, lte: dayEnd } },
        select: { id: true, date: true, type: true, utilityType: true, grossAmount: true, invoiceId: true, createdAt: true, paymentMethod: true, note: true },
        orderBy: { createdAt: "asc" },
      })
    : [{ id: entry.id, date: entry.date, type: entry.type, utilityType: entry.utilityType, grossAmount: entry.grossAmount, invoiceId: entry.invoiceId, createdAt: entry.createdAt, paymentMethod: entry.paymentMethod, note: entry.note }];

  const primary = receiptPrimary(group);
  const amount = Math.round(group.reduce((s, e) => s + e.grossAmount, 0) * 100) / 100;

  // Invoice position after this payment event (payments up to this day).
  let invoiceBlock: ReceiptData["invoice"] = null;
  if (entry.invoice) {
    const paidAgg = await prisma.incomeEntry.aggregate({
      where: { invoiceId: entry.invoice.id, date: { lte: dayEnd } },
      _sum: { grossAmount: true },
    });
    const paidToDate = paidAgg._sum.grossAmount ?? amount;
    invoiceBlock = {
      invoiceNumber: entry.invoice.invoiceNumber,
      periodLabel: `${MONTH_NAMES[entry.invoice.periodMonth - 1]} ${entry.invoice.periodYear}`,
      totalAmount: entry.invoice.totalAmount,
      paidToDate,
      outstanding: Math.max(entry.invoice.totalAmount - paidToDate, 0),
    };
  }

  // Deposit position when this payment carries a deposit component.
  let depositBlock: ReceiptData["deposit"] = null;
  if (group.some((e) => e.type === "DEPOSIT")) {
    const depositEntries = await prisma.incomeEntry.findMany({
      where: { tenantId: entry.tenant.id, type: "DEPOSIT", date: { lte: dayEnd } },
      select: { grossAmount: true },
    });
    const pos = calcDepositPosition(entry.tenant.depositAmount, depositEntries);
    depositBlock = { contractual: pos.contractual, receivedToDate: pos.received ?? 0 };
  }

  const property = entry.unit.property;
  const org = property.organization;
  const lines = receiptLines(group, entry.invoice ? { periodYear: entry.invoice.periodYear, periodMonth: entry.invoice.periodMonth } : null);
  const receiptNumber = receiptNumberFor(primary);
  const paymentMethod = group.find((e) => e.paymentMethod)?.paymentMethod ?? null;
  const reference = (primary.note ?? group.find((e) => e.note)?.note ?? "").split("\n")[0].trim().slice(0, 120) || null;

  const data: ReceiptData = {
    receiptNumber,
    lines,
    amount,
    paidAt: primary.date,
    paymentMethod,
    reference,
    currency: property.currency,
    invoice: invoiceBlock,
    deposit: depositBlock,
    stamp: receiptStamp({ invoice: invoiceBlock ? { totalAmount: invoiceBlock.totalAmount, paidToDate: invoiceBlock.paidToDate } : null }),
    org: org ? { name: org.name, logoUrl: org.logoUrl, address: org.address, phone: org.phone, email: org.email } : null,
    tenant: {
      name: entry.tenant.name,
      email: entry.tenant.email,
      phone: entry.tenant.phone,
      unit: {
        unitNumber: entry.unit.unitNumber,
        property: { name: property.name, address: property.address, city: property.city, logoUrl: property.logoUrl },
      },
    },
  };

  return {
    primary,
    entries: group,
    groupKey: receiptGroupKey(primary),
    description: receiptDescription(lines),
    tenant: entry.tenant,
    propertyId: property.id,
    propertyName: property.name,
    organizationId: property.organizationId,
    data,
    filename: `${receiptNumber}.pdf`,
  };
}
