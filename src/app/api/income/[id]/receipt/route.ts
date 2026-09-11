import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { generateReceiptPdf } from "@/lib/receipt-pdf";
import { loadPaymentReceipt } from "@/lib/payment-receipt-data";

export const maxDuration = 30;

// GET /api/income/[id]/receipt — the manager-side receipt PDF for a payment
// (any entry of the payment event). Same renderer as the tenant portal.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const payload = await loadPaymentReceipt(params.id);
  if (!payload) {
    return Response.json({ error: "Receipts are only available for payments linked to a tenant." }, { status: 404 });
  }
  const access = await requirePropertyAccess(payload.propertyId);
  if (!access.ok) return access.error!;

  const buffer = await generateReceiptPdf(payload.data);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${payload.filename}"`,
    },
  });
}
