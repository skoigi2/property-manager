import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

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
      incomeEntryId: string;
      amount: number;
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
    prisma.incomeEntry.findMany({
      where: {
        tenantId: tenant.id,
        type: "LONGTERM_RENT",
        ...(cursorDate ? { date: { lt: cursorDate } } : {}),
      },
      orderBy: { date: "desc" },
      take: limit,
      select: {
        id: true,
        date: true,
        grossAmount: true,
        paymentMethod: true,
        invoiceId: true,
        invoice: { select: { invoiceNumber: true } },
      },
    }),
  ]);

  const totalInvoiced = allInvoices
    .filter((i) => i.status !== "DRAFT")
    .reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = allInvoices.reduce((s, i) => s + (i.paidAmount ?? 0), 0);
  const outstanding = Math.max(0, totalInvoiced - totalPaid);

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
    ...eventPayments.map<LedgerEvent>((p) => ({
      kind: "PAYMENT_RECEIVED",
      date: p.date,
      incomeEntryId: p.id,
      amount: p.grossAmount,
      paymentMethod: p.paymentMethod,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice?.invoiceNumber ?? null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Cursor for next page = oldest event's date (clients pass it back).
  const nextCursor = events.length === limit ? events[events.length - 1].date.toISOString() : null;

  return Response.json({
    summary: { totalInvoiced, totalPaid, outstanding },
    events,
    nextCursor,
  });
}
