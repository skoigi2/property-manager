import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateOwnerInvoicePdf, type OwnerInvoiceData } from "@/lib/owner-invoice-pdf";
import type { OwnerInvoiceLineItem } from "@/lib/validations";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.ownerInvoice.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { id: true, name: true, address: true, city: true } },
      owner:    { select: { name: true, email: true, phone: true } },
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(invoice.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: OwnerInvoiceData = {
    ...invoice,
    lineItems: invoice.lineItems as OwnerInvoiceLineItem[],
  };

  const buffer = await generateOwnerInvoicePdf(data);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
