import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { groupReceipts, receiptLines, receiptNumberFor } from "@/lib/payment-receipt";

// Income types a tenant pays and can hold a receipt for. AIRBNB stays out
// (not a tenancy payment); owner-fee types never carry a tenantId.
const TENANT_PAYMENT_TYPES = [
  "LONGTERM_RENT", "DEPOSIT", "SERVICE_CHARGE", "UTILITY_RECOVERY", "OTHER", "LEASE_FEE",
] as const;

type LedgerEvent =
  | {
      kind: "INVOICE_ISSUED";
      date: Date;
      invoiceId: string;
      invoiceNumber: string;
      periodYear: number;
      periodMonth: number;
      amount: number;
      totalAmount: number;
      paidAmount: number;
      status: string;
      proofType: string | null;
    }
  | {
      kind: "PAYMENT_RECEIVED";
      date: Date;
      /** Primary entry of the payment event — the receipt's id. */
      incomeEntryId: string;
      receiptNumber: string;
      receiptUrl: string;
      amount: number;
      /** One row per component (rent / deposit / fee). */
      lines: { type: string; label: string; amount: number }[];
      isDeposit: boolean;
      paymentMethod: string | null;
      invoiceId: string | null;
      invoiceNumber: string | null;
    };

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10) || 30, 100);
  const cursor = url.searchParams.get("cursor"); // ISO date string

  const cursorDate = cursor ? new Date(cursor) : null;

  // Pull invoices (issue events) + income entries (payment events) in parallel.
  const [allInvoices, eventInvoices, eventPayments] = await Promise.all([
    // For summary — totals across the entire history.
    prisma.invoice.findMany({
      where: { tenantId: tenant.id, status: { not: "CANCELLED" } },
      select: { totalAmount: true, paidAmount: true, status: true },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId: tenant.id,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        periodYear: true,
        periodMonth: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        proofOfPaymentType: true,
      },
    }),
    // Over-fetch: a payment event may span several rows (rent + deposit + fee
    // on one day) which collapse into one PAYMENT_RECEIVED event below.
    prisma.incomeEntry.findMany({
      where: {
        tenantId: tenant.id,
        type: { in: [...TENANT_PAYMENT_TYPES] },
        ...(cursorDate ? { date: { lt: cursorDate } } : {}),
      },
      orderBy: { date: "desc" },
      take: limit * 4,
      select: {
        id: true,
        date: true,
        type: true,
        utilityType: true,
        grossAmount: true,
        paymentMethod: true,
        invoiceId: true,
        createdAt: true,
        invoice: { select: { invoiceNumber: true, periodYear: true, periodMonth: true } },
      },
    }),
  ]);

  // Summary stays invoice-based: deposits and fees paid outside an invoice
  // must not reduce the rent "outstanding" figure.
  const totalInvoiced = allInvoices
    .filter((i) => i.status !== "DRAFT")
    .reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = allInvoices.reduce((s, i) => s + (i.paidAmount ?? 0), 0);
  const outstanding = Math.max(0, totalInvoiced - totalPaid);

  const paymentEvents = groupReceipts(eventPayments)
    .slice(0, limit)
    .map<LedgerEvent>((g) => {
      const inv = g.primary.invoice;
      const lines = receiptLines(g.entries, inv ? { periodYear: inv.periodYear, periodMonth: inv.periodMonth } : null);
      return {
        kind: "PAYMENT_RECEIVED",
        date: new Date(g.primary.date),
        incomeEntryId: g.primary.id,
        receiptNumber: receiptNumberFor(g.primary),
        receiptUrl: `/api/portal/${params.token}/payments/${g.primary.id}/receipt`,
        amount: g.amount,
        lines: g.entries.map((e, i) => ({ type: e.type, label: lines[i].label, amount: e.grossAmount })),
        isDeposit: g.entries.every((e) => e.type === "DEPOSIT"),
        paymentMethod: g.entries.find((e) => e.paymentMethod)?.paymentMethod ?? null,
        invoiceId: g.primary.invoiceId,
        invoiceNumber: inv?.invoiceNumber ?? null,
      };
    });

  const events: LedgerEvent[] = [
    ...eventInvoices.map<LedgerEvent>((i) => ({
      kind: "INVOICE_ISSUED",
      date: i.createdAt,
      invoiceId: i.id,
      invoiceNumber: i.invoiceNumber,
      periodYear: i.periodYear,
      periodMonth: i.periodMonth,
      amount: i.totalAmount,
      totalAmount: i.totalAmount,
      paidAmount: i.paidAmount ?? 0,
      status: i.status,
      proofType: i.proofOfPaymentType,
    })),
    ...paymentEvents,
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Cursor for next page = oldest event's date (clients pass it back).
  const nextCursor = events.length === limit ? events[events.length - 1].date.toISOString() : null;

  return Response.json({
    summary: { totalInvoiced, totalPaid, outstanding },
    events,
    nextCursor,
  });
}
