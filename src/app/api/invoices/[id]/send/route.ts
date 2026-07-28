import "server-only";
export const maxDuration = 30; // PDF render + email send

import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { emailInvoiceToTenant, InvoiceEmailError } from "@/lib/invoice-email";

// ── POST /api/invoices/[id]/send ─────────────────────────────────────────────
// Emails the invoice PDF to the tenant, marks a DRAFT invoice as SENT, and
// logs the send in the tenant's communication trail.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Access check before doing any work.
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    select: { tenant: { select: { unit: { select: { propertyId: true } } } } },
  });
  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(invoice.tenant.unit.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await emailInvoiceToTenant(params.id, {
      loggedByEmail: session!.user.email ?? "system",
      loggedByName: session!.user.name ?? null,
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof InvoiceEmailError) {
      return Response.json({ error: e.message }, { status: e.statusCode });
    }
    throw e;
  }
}
