import "server-only";
import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { buildInvoicePdfPayload } from "@/lib/invoice-pdf-data";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await buildInvoicePdfPayload(params.id);
  if (!payload) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(payload.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const pdfBuffer = await generateInvoicePdf(payload.data);

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payload.invoice.invoiceNumber}.pdf"`,
    },
  });
}
