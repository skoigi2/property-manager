import "server-only";
export const maxDuration = 60; // N × (PDF render + email send)

import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { emailInvoiceToTenant, InvoiceEmailError } from "@/lib/invoice-email";

const MAX_BATCH = 50;

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BATCH),
});

// ── POST /api/invoices/bulk-send ─────────────────────────────────────────────
// Emails each selected invoice's PDF to its tenant. Per-invoice failures don't
// abort the batch — the response lists exactly which sends failed and why.
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: parsed.data.ids } },
    select: {
      id: true, invoiceNumber: true, status: true,
      tenant: { select: { name: true, unit: { select: { propertyId: true } } } },
    },
  });

  const sent: { id: string; invoiceNumber: string; sentTo: string }[] = [];
  const failed: { id: string; invoiceNumber: string; tenant: string; error: string }[] = [];

  const actor = {
    loggedByEmail: session!.user.email ?? "system",
    loggedByName: session!.user.name ?? null,
  };

  for (const inv of invoices) {
    if (!propertyIds.includes(inv.tenant.unit.propertyId)) {
      failed.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, tenant: inv.tenant.name, error: "No access" });
      continue;
    }
    if (inv.status === "PAID" || inv.status === "CANCELLED") {
      failed.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, tenant: inv.tenant.name, error: `Invoice is ${inv.status.toLowerCase()}` });
      continue;
    }
    try {
      const result = await emailInvoiceToTenant(inv.id, actor);
      sent.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, sentTo: result.sentTo });
    } catch (e) {
      failed.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        tenant: inv.tenant.name,
        error: e instanceof InvoiceEmailError ? e.message : "Send failed",
      });
    }
  }

  return Response.json({ sent: sent.length, failed: failed.length, sentDetails: sent, failedDetails: failed });
}
