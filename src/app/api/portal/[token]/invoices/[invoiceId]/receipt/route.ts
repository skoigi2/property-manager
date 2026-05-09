import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { generateReceiptPdf } from "@/lib/receipt-pdf";

export const maxDuration = 30;

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
      incomeEntries: {
        orderBy: { date: "desc" },
        take: 1,
        select: { paymentMethod: true, date: true },
      },
    },
  });

  if (!invoice || invoice.tenantId !== tenant.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status !== "PAID" || invoice.paidAmount == null || invoice.paidAt == null) {
    return Response.json({ error: "Receipt only available for paid invoices" }, { status: 400 });
  }

  const property = tenant.unit.property;
  const orgBase = property.organization;
  const paymentMethod = invoice.incomeEntries[0]?.paymentMethod ?? null;

  const buffer = await generateReceiptPdf({
    invoiceNumber: invoice.invoiceNumber,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    paidAt: invoice.paidAt,
    paymentMethod,
    currency: property.currency,
    org: orgBase
      ? {
          name: orgBase.name,
          logoUrl: orgBase.logoUrl,
          address: orgBase.address,
          phone: orgBase.phone,
          email: orgBase.email,
        }
      : null,
    tenant: {
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      unit: {
        unitNumber: tenant.unit.unitNumber,
        property: {
          name: property.name,
          address: property.address,
          city: property.city,
          logoUrl: property.logoUrl,
        },
      },
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${invoice.invoiceNumber}.pdf"`,
    },
  });
}
