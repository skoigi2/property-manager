import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { generateReceiptPdf } from "@/lib/receipt-pdf";
import { loadPaymentReceipt } from "@/lib/payment-receipt-data";

export const maxDuration = 30;

// Receipt for any payment the tenant made — rent, deposit, fees. The entry
// id may be any member of the payment event; the receipt covers the group.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; entryId: string } },
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const payload = await loadPaymentReceipt(params.entryId);
  if (!payload || payload.tenant.id !== tenant.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await generateReceiptPdf(payload.data);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${payload.filename}"`,
    },
  });
}
