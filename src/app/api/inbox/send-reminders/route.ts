export const maxDuration = 60;

import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendRentReminderToTenant } from "@/lib/rent-reminder";

const MAX_BATCH = 50;

const schema = z.object({
  invoiceIds: z.array(z.string().min(1)).min(1).max(MAX_BATCH),
});

// ── POST /api/inbox/send-reminders ───────────────────────────────────────────
// Emails a real rent-payment reminder to the tenant of each overdue invoice
// (the Inbox bulk action). Every send is logged to the tenant's communication
// trail; tenants without an email address are reported back, not silently
// skipped. Email content lives in src/lib/rent-reminder.ts, shared with the
// TENANT_RENT_REMINDERS dunning automation.
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: parsed.data.invoiceIds } },
    select: {
      id: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true,
      dueDate: true, periodYear: true, periodMonth: true,
      tenant: {
        select: {
          id: true, name: true, email: true,
          unit: {
            select: {
              unitNumber: true, propertyId: true,
              property: { select: { name: true, currency: true, organizationId: true, organization: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const sent: { invoiceId: string; tenant: string; sentTo: string }[] = [];
  const failed: { invoiceId: string; tenant: string; error: string }[] = [];

  for (const inv of invoices) {
    const t = inv.tenant;
    if (!propertyIds.includes(t.unit.propertyId)) {
      failed.push({ invoiceId: inv.id, tenant: t.name, error: "No access" });
      continue;
    }
    if (inv.status === "PAID" || inv.status === "CANCELLED") {
      failed.push({ invoiceId: inv.id, tenant: t.name, error: `Invoice is ${inv.status.toLowerCase()}` });
      continue;
    }

    try {
      const { sentTo } = await sendRentReminderToTenant(inv, "OVERDUE", {
        email: session!.user.email ?? "system",
        name: session!.user.name,
      });
      sent.push({ invoiceId: inv.id, tenant: t.name, sentTo });
    } catch (e) {
      failed.push({
        invoiceId: inv.id,
        tenant: t.name,
        error: e instanceof Error ? e.message : "Email send failed",
      });
    }
  }

  return Response.json({ sent: sent.length, failed: failed.length, sentDetails: sent, failedDetails: failed });
}
