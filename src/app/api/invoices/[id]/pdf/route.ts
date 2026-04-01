import "server-only";
import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      tenant: {
        select: {
          id: true, name: true, email: true, phone: true,
          unit: {
            select: {
              unitNumber: true, type: true,
              property: {
                select: {
                  id: true, name: true, address: true, city: true, logoUrl: true, currency: true,
                  organization: { select: { name: true, logoUrl: true, address: true, phone: true, email: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(invoice.tenant.unit.property.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = invoice.tenant.unit.property.organization;
  const pdfBuffer = await generateInvoicePdf({
    ...invoice,
    currency: invoice.tenant.unit.property.currency,
    org: org ?? null,
    tenant: {
      ...invoice.tenant,
      unit: {
        ...invoice.tenant.unit,
        property: {
          ...invoice.tenant.unit.property,
          logoUrl: invoice.tenant.unit.property.logoUrl ?? null,
        },
      },
    },
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
