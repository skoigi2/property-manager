import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { loadPaymentReceipt } from "@/lib/payment-receipt-data";
import { emailPaymentReceipt, ReceiptEmailError } from "@/lib/receipt-email";
import { logAudit } from "@/lib/audit";

export const maxDuration = 30;

// POST /api/income/[id]/receipt/email — email the payment's receipt PDF to
// the tenant on demand (the automatic send is TENANT_PAYMENT_RECEIPTS).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const payload = await loadPaymentReceipt(params.id);
  if (!payload) {
    return Response.json({ error: "Receipts are only available for payments linked to a tenant." }, { status: 404 });
  }
  const access = await requirePropertyAccess(payload.propertyId);
  if (!access.ok) return access.error!;

  try {
    const result = await emailPaymentReceipt(params.id, {
      loggedByEmail: session!.user.email ?? "unknown",
      loggedByName: session!.user.name ?? null,
    });
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "IncomeEntry",
      resourceId: params.id,
      organizationId: session!.user.organizationId,
      after: { receiptEmailed: result.receiptNumber, to: result.sentTo },
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof ReceiptEmailError) {
      return Response.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("[receipt/email] send failed", e);
    return Response.json({ error: "Could not send the receipt. Please try again." }, { status: 500 });
  }
}
