import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { generateReceiptPdf, type ReceiptData } from "@/lib/receipt-pdf";
import { loadPaymentReceipt } from "@/lib/payment-receipt-data";
import { receiptStamp } from "@/lib/payment-receipt";

export const maxDuration = 30;

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Legacy URL kept for links already in the wild: the receipt for an invoice is
// the receipt of its most recent payment event (all entries on that day).
// Invoices marked PAID before income entries were recorded have no entry to
// render from, so a receipt is synthesised from the invoice itself.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; invoiceId: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: {
      incomeEntries: { orderBy: [{ date: "desc" }, { createdAt: "asc" }], take: 1, select: { id: true } },
    },
  });

  if (!invoice || invoice.tenantId !== tenant.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const latest = invoice.incomeEntries[0];
  if (latest) {
    const payload = await loadPaymentReceipt(latest.id);
    if (payload && payload.tenant.id === tenant.id) {
      const buffer = await generateReceiptPdf(payload.data);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${payload.filename}"`,
        },
      });
    }
  }

  if (invoice.status !== "PAID" || invoice.paidAmount == null || invoice.paidAt == null) {
    return Response.json({ error: "Receipt only available for paid invoices" }, { status: 400 });
  }

  const property = tenant.unit.property;
  const orgBase = property.organization;
  const paidToDate = invoice.paidAmount;
  const data: ReceiptData = {
    receiptNumber: `RCPT-${invoice.invoiceNumber}`,
    lines: [{ label: `Rent — ${MONTH_NAMES[invoice.periodMonth - 1]} ${invoice.periodYear}`, amount: invoice.paidAmount }],
    amount: invoice.paidAmount,
    paidAt: invoice.paidAt,
    paymentMethod: null,
    currency: property.currency,
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      periodLabel: `${MONTH_NAMES[invoice.periodMonth - 1]} ${invoice.periodYear}`,
      totalAmount: invoice.totalAmount,
      paidToDate,
      outstanding: Math.max(invoice.totalAmount - paidToDate, 0),
    },
    stamp: receiptStamp({ invoice: { totalAmount: invoice.totalAmount, paidToDate } }),
    org: orgBase
      ? { name: orgBase.name, logoUrl: orgBase.logoUrl, address: orgBase.address, phone: orgBase.phone, email: orgBase.email }
      : null,
    tenant: {
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      unit: {
        unitNumber: tenant.unit.unitNumber,
        property: { name: property.name, address: property.address, city: property.city, logoUrl: property.logoUrl },
      },
    },
  };

  const buffer = await generateReceiptPdf(data);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${invoice.invoiceNumber}.pdf"`,
    },
  });
}
